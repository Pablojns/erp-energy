import { documentDigits } from './conta-azul.pessoas';

export type CaVenda = {
  contaAzulId: string;
  numero: string | null;
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

export function valuesClose(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  if (diff <= 0.05) return true;
  const base = Math.max(Math.abs(a), Math.abs(b), 1);
  return diff / base <= 0.005;
}

export function mapContaAzulVenda(
  item: Record<string, unknown>,
): CaVenda | null {
  const id = asText(item.id) ?? asText(item.uuid);
  if (!id) return null;
  const cliente = asRecord(item.cliente);
  const situacaoRec = asRecord(item.situacao);
  const numeroRaw = item.numero ?? item.numero_venda;
  return {
    contaAzulId: id,
    numero: numeroRaw == null ? null : String(numeroRaw).trim() || null,
    data: asText(item.data) ?? asText(item.data_venda),
    total: asNumber(item.total ?? item.valor ?? item.valor_total),
    situacao:
      asText(situacaoRec?.nome) ??
      asText(situacaoRec?.descricao) ??
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
    if (takenOrders.has(order.id) || takenVendas.has(venda.contaAzulId)) return;
    if (order.contaAzulVendaId && order.contaAzulVendaId !== venda.contaAzulId) {
      return;
    }
    takenOrders.add(order.id);
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
    const variants = orderNumberVariants(venda.numero);
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
