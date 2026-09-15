import {
  invoiceNumberDigits,
  invoiceNumberMatchesRemessa,
  sameInvoiceNumber,
} from '../orders/order-search';
import { documentDigits } from './conta-azul.pessoas';

export type CaVenda = {
  contaAzulId: string;
  numero: string | null;
  /** Número do pedido cliente na venda CA, quando a API envia campo separado. */
  numeroPedido: string | null;
  data: string | null;
  total: number;
  situacao: string | null;
  clienteId: string | null;
  clienteNome: string | null;
  clienteDocumento: string | null;
};

export type ErpOrderForVendaMatch = {
  id: string;
  code: string;
  externalOrderNumber: string | null;
  customerDocument: string | null;
  deliveryCnpj: string | null;
  total: number;
  status: string;
  contaAzulVendaId: string | null;
};

export type VendaMatchReason =
  | 'numero'
  | 'numero_cnpj'
  | 'numero_valor'
  | 'cnpj_valor';

export type VendaVinculoPreview = {
  vendaId: string;
  vendaNumero: string | null;
  vendaTotal: number;
  clienteNome: string | null;
  cnpj: string | null;
  orderId: string;
  orderCode: string;
  externalOrderNumber: string | null;
  reason: VendaMatchReason;
};

export type VendaSemMatch = {
  vendaId: string;
  vendaNumero: string | null;
  vendaTotal: number;
  clienteNome: string | null;
  cnpj: string | null;
  motivo: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'object') return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function orderNumberVariants(raw: string | number | null | undefined): string[] {
  const text = String(raw ?? '').trim();
  const digits = documentDigits(text);
  const set = new Set<string>();
  for (const v of [text, digits, digits.replace(/^0+/, '') || digits]) {
    if (!v) continue;
    set.add(v);
    set.add(`#${v}`);
    if (/^\d+$/.test(v) && v.length < 10) set.add(v.padStart(10, '0'));
    if (/^\d+$/.test(v) && v.length === 10) {
      set.add(v.replace(/^0+/, '') || v);
    }
  }
  return [...set];
}

/** Pedido WEG ME: 10 dígitos; parcelas acrescentam 1–4 dígitos no sufixo. */
export const WEG_ORDER_BASE_LENGTH = 10;

export function wegOrderDigits(
  raw: string | number | null | undefined,
): string {
  const digits = documentDigits(raw);
  return digits.replace(/^0+/, '') || digits;
}

/**
 * Prefixo de 10 dígitos que identifica o pedido WEG e todas as parcelas.
 * Números curtos (venda avulsa 7, 10, etc.) não são família WEG.
 */
export function wegOrderBase(
  raw: string | number | null | undefined,
): string | null {
  const digits = wegOrderDigits(raw);
  if (digits.length < WEG_ORDER_BASE_LENGTH) return null;
  if (digits.length > 14) return null;
  return digits.slice(0, WEG_ORDER_BASE_LENGTH);
}

export function sameWegOrderFamily(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): boolean {
  const baseA = wegOrderBase(a);
  const baseB = wegOrderBase(b);
  return Boolean(baseA && baseB && baseA === baseB);
}

export function pickWegFamilyOrder<T extends { externalOrderNumber: string | null }>(
  pedido: string | number | null | undefined,
  orders: T[],
): T | undefined {
  const wanted = wegOrderDigits(pedido);
  if (!wanted) return undefined;
  const exact = orders.filter(
    (o) => wegOrderDigits(o.externalOrderNumber) === wanted,
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;

  const base = wegOrderBase(wanted);
  if (!base) return undefined;
  const family = orders.filter(
    (o) => wegOrderBase(o.externalOrderNumber) === base,
  );
  if (family.length === 0) return undefined;
  if (family.length === 1) return family[0];
  const baseOrder = family.filter(
    (o) => wegOrderDigits(o.externalOrderNumber) === base,
  );
  if (baseOrder.length === 1) return baseOrder[0];
  return undefined;
}

/** Prefere o campo que parece pedido WEG (10+ dígitos); senão qualquer número. */
export function vendaWegHint(
  venda: Pick<CaVenda, 'numero' | 'numeroPedido'>,
): string | null {
  if (wegOrderBase(venda.numeroPedido)) return venda.numeroPedido;
  if (wegOrderBase(venda.numero)) return venda.numero;
  return venda.numeroPedido || venda.numero;
}

export function valuesClose(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  if (diff <= 0.05) return true;
  const base = Math.max(Math.abs(a), Math.abs(b), 1);
  return diff / base <= 0.005;
}

export function mapContaAzulVenda(
  item: Record<string, unknown>,
): CaVenda | null {
  const src = asRecord(item.venda) ?? item;
  const id = asText(src.id) ?? asText(src.uuid) ?? asText(item.id) ?? asText(item.uuid);
  if (!id) return null;
  const cliente = asRecord(src.cliente) ?? asRecord(item.cliente);
  const situacaoRec = asRecord(src.situacao) ?? asRecord(item.situacao);
  const numeroRaw = src.numero ?? src.numero_venda ?? item.numero;
  const pedidoRec = asRecord(src.pedido) ?? asRecord(item.pedido);
  const numeroPedido =
    asText(src.numero_pedido) ??
    asText(src.codigo_pedido) ??
    asText(src.numero_pedido_cliente) ??
    asText(item.numero_pedido) ??
    asText(item.codigo_pedido) ??
    asText(item.numero_pedido_cliente) ??
    asText(pedidoRec?.numero) ??
    asText(pedidoRec?.codigo) ??
    asText(pedidoRec?.numero_pedido);
  return {
    contaAzulId: id,
    numero: numeroRaw == null ? null : String(numeroRaw).trim() || null,
    numeroPedido,
    data: asText(src.data) ?? asText(src.data_venda) ?? asText(item.data),
    total: asNumber(src.total ?? src.valor ?? src.valor_total ?? item.total),
    situacao:
      asText(situacaoRec?.nome) ??
      asText(situacaoRec?.descricao) ??
      asText(src.situacao) ??
      asText(item.situacao),
    clienteId: asText(cliente?.id),
    clienteNome: asText(cliente?.nome),
    clienteDocumento:
      asText(cliente?.documento) ??
      asText(cliente?.cnpj) ??
      asText(cliente?.cpf),
  };
}

function isInactiveOrder(status: string): boolean {
  const s = status.toUpperCase();
  return s === 'CANCELADO' || s === 'ARQUIVADO';
}

function preferActive(orders: ErpOrderForVendaMatch[]): ErpOrderForVendaMatch[] {
  const active = orders.filter((o) => !isInactiveOrder(o.status));
  return active.length ? active : orders;
}

function orderCnpj(order: ErpOrderForVendaMatch): string {
  return (
    documentDigits(order.deliveryCnpj) ||
    documentDigits(order.customerDocument)
  );
}

export function planVendaVinculos(input: {
  vendas: CaVenda[];
  orders: ErpOrderForVendaMatch[];
}): {
  claros: VendaVinculoPreview[];
  semCorrespondencia: VendaSemMatch[];
} {
  const byNumber = new Map<string, ErpOrderForVendaMatch[]>();
  for (const order of input.orders) {
    const variants = [...orderNumberVariants(order.externalOrderNumber)];
    const code = order.code?.trim();
    if (code) variants.push(code);
    for (const v of variants) {
      const list = byNumber.get(v) ?? [];
      list.push(order);
      byNumber.set(v, list);
    }
  }

  const takenOrders = new Set<string>();
  const takenVendas = new Set<string>();
  const claros: VendaVinculoPreview[] = [];
  const semCorrespondencia: VendaSemMatch[] = [];

  const alreadyLinked = new Set(
    input.orders
      .map((o) => o.contaAzulVendaId)
      .filter((id): id is string => Boolean(id)),
  );

  const pushClear = (
    venda: CaVenda,
    order: ErpOrderForVendaMatch,
    reason: VendaMatchReason,
  ) => {
    if (takenVendas.has(venda.contaAzulId)) return;
    if (order.contaAzulVendaId && order.contaAzulVendaId !== venda.contaAzulId) {
      if (
        !sameWegOrderFamily(
          vendaWegHint(venda),
          order.externalOrderNumber,
        )
      ) {
        return;
      }
    }
    if (takenOrders.has(order.id)) {
      if (
        !sameWegOrderFamily(
          vendaWegHint(venda),
          order.externalOrderNumber,
        )
      ) {
        return;
      }
    } else {
      takenOrders.add(order.id);
    }
    takenVendas.add(venda.contaAzulId);
    claros.push({
      vendaId: venda.contaAzulId,
      vendaNumero: venda.numero,
      vendaTotal: venda.total,
      clienteNome: venda.clienteNome,
      cnpj: documentDigits(venda.clienteDocumento) || null,
      orderId: order.id,
      orderCode: order.code,
      externalOrderNumber: order.externalOrderNumber,
      reason,
    });
  };

  for (const venda of input.vendas) {
    if (alreadyLinked.has(venda.contaAzulId)) {
      takenVendas.add(venda.contaAzulId);
      continue;
    }
    const variants = [
      ...orderNumberVariants(venda.numero),
      ...orderNumberVariants(venda.numeroPedido),
    ];
    const byNum: ErpOrderForVendaMatch[] = [];
    const seen = new Set<string>();
    for (const v of variants) {
      for (const order of byNumber.get(v) ?? []) {
        if (seen.has(order.id)) continue;
        seen.add(order.id);
        byNum.push(order);
      }
    }
    const uniqueNum = preferActive(byNum);
    const cnpj = documentDigits(venda.clienteDocumento);
    const familyHint = vendaWegHint(venda);
    const looksWeg = Boolean(wegOrderBase(familyHint));

    if (uniqueNum.length === 1) {
      const order = uniqueNum[0];
      const sameCnpj = cnpj.length >= 11 && orderCnpj(order) === cnpj;
      const sameValor = valuesClose(order.total, venda.total);
      pushClear(
        venda,
        order,
        sameCnpj ? 'numero_cnpj' : sameValor ? 'numero_valor' : 'numero',
      );
      continue;
    }

    if (uniqueNum.length > 1) {
      const byCnpj =
        cnpj.length >= 11
          ? uniqueNum.filter((o) => orderCnpj(o) === cnpj)
          : [];
      if (byCnpj.length === 1) {
        pushClear(venda, byCnpj[0], 'numero_cnpj');
        continue;
      }
      const byValor = uniqueNum.filter((o) => valuesClose(o.total, venda.total));
      if (byValor.length === 1) {
        pushClear(venda, byValor[0], 'numero_valor');
        continue;
      }
      semCorrespondencia.push({
        vendaId: venda.contaAzulId,
        vendaNumero: venda.numero,
        vendaTotal: venda.total,
        clienteNome: venda.clienteNome,
        cnpj: cnpj || null,
        motivo: `Número bateu com ${uniqueNum.length} pedidos; CNPJ/valor não desambiguaram`,
      });
      continue;
    }

    const familyOrder = pickWegFamilyOrder(familyHint, preferActive(input.orders));
    if (familyOrder) {
      pushClear(venda, familyOrder, 'numero');
      continue;
    }

    if (looksWeg) {
      semCorrespondencia.push({
        vendaId: venda.contaAzulId,
        vendaNumero: venda.numero,
        vendaTotal: venda.total,
        clienteNome: venda.clienteNome,
        cnpj: cnpj || null,
        motivo:
          'Número WEG (10+ dígitos) sem pedido da mesma família no ERP — não vincula por CNPJ+valor',
      });
      continue;
    }

    if (cnpj.length >= 11 && venda.total > 0) {
      const cnpjMatches = preferActive(
        input.orders.filter(
          (o) =>
            !takenOrders.has(o.id) &&
            orderCnpj(o) === cnpj &&
            valuesClose(o.total, venda.total),
        ),
      );
      if (cnpjMatches.length === 1) {
        pushClear(venda, cnpjMatches[0], 'cnpj_valor');
        continue;
      }
      if (cnpjMatches.length > 1) {
        semCorrespondencia.push({
          vendaId: venda.contaAzulId,
          vendaNumero: venda.numero,
          vendaTotal: venda.total,
          clienteNome: venda.clienteNome,
          cnpj,
          motivo: `CNPJ+valor bateu com ${cnpjMatches.length} pedidos`,
        });
        continue;
      }
    }

    semCorrespondencia.push({
      vendaId: venda.contaAzulId,
      vendaNumero: venda.numero,
      vendaTotal: venda.total,
      clienteNome: venda.clienteNome,
      cnpj: cnpj || null,
      motivo: venda.numero
        ? 'Número da venda não encontrado no ERP'
        : 'Sem número e sem CNPJ+valor único',
    });
  }

  return { claros, semCorrespondencia };
}

export type ErpOrderForInvoiceFill = {
  id: string;
  code: string;
  externalOrderNumber: string | null;
  invoiceNumber: string | null;
  notaRemessa: string | null;
  contaAzulVendaId: string | null;
};

export type InvoiceFillPreview = {
  orderId: string;
  orderCode: string;
  externalOrderNumber: string | null;
  vendaId: string;
  invoiceNumber: string;
};

export type InvoiceFillDivergencia = {
  orderId: string;
  orderCode: string;
  externalOrderNumber: string | null;
  vendaId: string;
  invoiceNumberErp: string;
  invoiceNumberCa: string;
  motivo: string;
};

export type NotaForInvoiceFill = {
  idVenda: string | null;
  numero: string;
  numeroDigits: string;
};

function hasRealVendaInvoice(order: ErpOrderForInvoiceFill): boolean {
  const current = String(order.invoiceNumber ?? '').trim();
  if (!current || !invoiceNumberDigits(current)) return false;
  return !invoiceNumberMatchesRemessa(current, order.notaRemessa);
}

export function planInvoiceFromLinkedVendas(input: {
  orders: ErpOrderForInvoiceFill[];
  notas: NotaForInvoiceFill[];
}): {
  preencher: InvoiceFillPreview[];
  divergencias: InvoiceFillDivergencia[];
} {
  const notasByVenda = new Map<string, Map<string, string>>();
  for (const nf of input.notas) {
    const vendaId = String(nf.idVenda ?? '').trim();
    const digits = nf.numeroDigits || invoiceNumberDigits(nf.numero);
    if (!vendaId || !digits) continue;
    const display = String(nf.numero ?? '').trim() || digits;
    const byDigits = notasByVenda.get(vendaId) ?? new Map<string, string>();
    if (!byDigits.has(digits)) byDigits.set(digits, display);
    notasByVenda.set(vendaId, byDigits);
  }

  const preencher: InvoiceFillPreview[] = [];
  const divergencias: InvoiceFillDivergencia[] = [];

  for (const order of input.orders) {
    const vendaId = String(order.contaAzulVendaId ?? '').trim();
    if (!vendaId) continue;
    const byDigits = notasByVenda.get(vendaId);
    if (!byDigits || byDigits.size === 0) continue;

    const caNumbers = [...byDigits.values()];
    const caLabel = caNumbers.join(', ');
    if (byDigits.size > 1) {
      divergencias.push({
        orderId: order.id,
        orderCode: order.code,
        externalOrderNumber: order.externalOrderNumber,
        vendaId,
        invoiceNumberErp: String(order.invoiceNumber ?? '').trim(),
        invoiceNumberCa: caLabel,
        motivo: `Venda com ${byDigits.size} notas distintas na Conta Azul`,
      });
      continue;
    }

    const caNumber = caNumbers[0];
    if (invoiceNumberMatchesRemessa(caNumber, order.notaRemessa)) {
      continue;
    }
    if (!hasRealVendaInvoice(order)) {
      preencher.push({
        orderId: order.id,
        orderCode: order.code,
        externalOrderNumber: order.externalOrderNumber,
        vendaId,
        invoiceNumber: caNumber,
      });
      continue;
    }
    if (!sameInvoiceNumber(order.invoiceNumber, caNumber)) {
      divergencias.push({
        orderId: order.id,
        orderCode: order.code,
        externalOrderNumber: order.externalOrderNumber,
        vendaId,
        invoiceNumberErp: String(order.invoiceNumber ?? '').trim(),
        invoiceNumberCa: caNumber,
        motivo: 'Nota de Venda do ERP diferente da NF da venda na Conta Azul',
      });
    }
  }

  return { preencher, divergencias };
}
