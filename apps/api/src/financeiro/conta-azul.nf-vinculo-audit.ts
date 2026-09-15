import { invoiceNumberDigitList } from '../orders/order-search';
import {
  pickWegFamilyOrder,
  sameWegOrderFamily,
  vendaWegHint,
  wegOrderBase,
  wegOrderDigits,
  type CaVenda,
} from './conta-azul.vendas';

export type NfVinculoMismatchKind =
  | 'venda_outra_familia'
  | 'nf_outra_familia'
  | 'nf_duplicada_familias'
  | 'invoice_sem_historico'
  | 'parcela_ca_em_pedido_errado';

export type AuditOrderInput = {
  id: string;
  code: string;
  externalOrderNumber: string | null;
  invoiceNumber: string | null;
  notaRemessa?: string | null;
  contaAzulVendaId: string | null;
  status: string;
  history: Array<{ invoiceNumber: string }>;
  items?: Array<{
    quantity: number;
    pickedQty: number | null;
    missingQty: number | null;
    invoicedQty: number | null;
  }>;
};

export type AuditNotaInput = {
  numero: string | null;
  idVenda: string | null;
};

export type NfVinculoMismatch = {
  kind: NfVinculoMismatchKind;
  orderId: string;
  orderCode: string;
  externalOrderNumber: string | null;
  invoiceNumber: string | null;
  contaAzulVendaId: string | null;
  vendaNumero: string | null;
  vendaNumeroPedido: string | null;
  expectedOrderId: string | null;
  expectedExternal: string | null;
  otherOrderId?: string | null;
  otherExternal?: string | null;
  nfDigits?: string;
  motivo: string;
};

export type OldCompletedCleanupCandidate = {
  orderId: string;
  orderCode: string;
  externalOrderNumber: string | null;
  status: string;
  invoiceNumber: string | null;
  historyCount: number;
  itemsNeedingPick: number;
  faltaQty: number;
  reason: 'status_intermediario' | 'falta_separacao';
};

function nfDigitsOf(raw: string | null | undefined): string[] {
  return invoiceNumberDigitList(raw);
}

function orderNfDigits(order: AuditOrderInput): string[] {
  const remessa = new Set(nfDigitsOf(order.notaRemessa));
  const out = new Set<string>();
  const add = (raw: string | null | undefined) => {
    for (const d of nfDigitsOf(raw)) {
      if (remessa.has(d)) continue;
      if (d.length < 3) continue;
      out.add(d);
    }
  };
  add(order.invoiceNumber);
  for (const row of order.history) add(row.invoiceNumber);
  return [...out];
}

export function planNfVinculoAudit(input: {
  orders: AuditOrderInput[];
  vendas: CaVenda[];
  notas?: AuditNotaInput[];
}): {
  mismatches: NfVinculoMismatch[];
  ordersAffected: number;
  byKind: Record<NfVinculoMismatchKind, number>;
} {
  const vendaById = new Map(input.vendas.map((v) => [v.contaAzulId, v]));
  const mismatches: NfVinculoMismatch[] = [];
  const affected = new Set<string>();

  const push = (row: NfVinculoMismatch) => {
    mismatches.push(row);
    affected.add(row.orderId);
    if (row.expectedOrderId) affected.add(row.expectedOrderId);
    if (row.otherOrderId) affected.add(row.otherOrderId);
  };

  for (const order of input.orders) {
    const vendaId = String(order.contaAzulVendaId ?? '').trim();
    if (!vendaId) continue;
    const venda = vendaById.get(vendaId);
    if (!venda) continue;
    const hint = vendaWegHint(venda);
    if (!wegOrderBase(hint) && !wegOrderBase(order.externalOrderNumber)) {
      continue;
    }
    const expected = pickWegFamilyOrder(hint, input.orders);
    const sameFamily = sameWegOrderFamily(hint, order.externalOrderNumber);
    if (sameFamily && (!expected || expected.id === order.id)) continue;
    if (!sameFamily || (expected && expected.id !== order.id)) {
      push({
        kind: expected && expected.id !== order.id
          ? 'parcela_ca_em_pedido_errado'
          : 'venda_outra_familia',
        orderId: order.id,
        orderCode: order.code,
        externalOrderNumber: order.externalOrderNumber,
        invoiceNumber: order.invoiceNumber,
        contaAzulVendaId: vendaId,
        vendaNumero: venda.numero,
        vendaNumeroPedido: venda.numeroPedido,
        expectedOrderId: expected?.id ?? null,
        expectedExternal: expected?.externalOrderNumber ?? wegOrderBase(hint),
        motivo: expected
          ? `Venda CA ${hint} pertence à família ${expected.externalOrderNumber}, mas está em ${order.externalOrderNumber}`
          : `Venda CA ${hint} não é da mesma família WEG do pedido ${order.externalOrderNumber}`,
      });
    }
  }

  const notaByNf = new Map<string, AuditNotaInput>();
  for (const nota of input.notas ?? []) {
    for (const d of nfDigitsOf(nota.numero)) {
      if (d && !notaByNf.has(d)) notaByNf.set(d, nota);
    }
  }

  for (const order of input.orders) {
    for (const digits of orderNfDigits(order)) {
      const nota = notaByNf.get(digits);
      const vendaId = String(nota?.idVenda ?? '').trim();
      if (!vendaId) continue;
      const venda = vendaById.get(vendaId);
      if (!venda) continue;
      const hint = vendaWegHint(venda);
      if (!wegOrderBase(hint)) continue;
      if (sameWegOrderFamily(hint, order.externalOrderNumber)) continue;
      const expected = pickWegFamilyOrder(hint, input.orders);
      push({
        kind: 'nf_outra_familia',
        orderId: order.id,
        orderCode: order.code,
        externalOrderNumber: order.externalOrderNumber,
        invoiceNumber: order.invoiceNumber,
        contaAzulVendaId: order.contaAzulVendaId,
        vendaNumero: venda.numero,
        vendaNumeroPedido: venda.numeroPedido,
        expectedOrderId: expected?.id ?? null,
        expectedExternal: expected?.externalOrderNumber ?? wegOrderBase(hint),
        nfDigits: digits,
        motivo: `NF ${digits} pertence à venda CA ${hint}, família diferente de ${order.externalOrderNumber}`,
      });
    }
  }

  const nfOwners = new Map<string, AuditOrderInput[]>();
  for (const order of input.orders) {
    for (const digits of orderNfDigits(order)) {
      const list = nfOwners.get(digits) ?? [];
      list.push(order);
      nfOwners.set(digits, list);
    }
  }
  for (const [digits, owners] of nfOwners) {
    const unique = new Map(owners.map((o) => [o.id, o]));
    if (unique.size < 2) continue;
    const list = [...unique.values()];
    const bases = new Set(
      list.map((o) => wegOrderBase(o.externalOrderNumber)).filter(Boolean),
    );
    if (bases.size < 2) continue;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const b = list[i === 0 ? 1 : 0];
      push({
        kind: 'nf_duplicada_familias',
        orderId: a.id,
        orderCode: a.code,
        externalOrderNumber: a.externalOrderNumber,
        invoiceNumber: a.invoiceNumber,
        contaAzulVendaId: a.contaAzulVendaId,
        vendaNumero: null,
        vendaNumeroPedido: null,
        expectedOrderId: b.id,
        expectedExternal: b.externalOrderNumber,
        otherOrderId: b.id,
        otherExternal: b.externalOrderNumber,
        nfDigits: digits,
        motivo: `NF ${digits} está em famílias WEG diferentes (${a.externalOrderNumber} e ${b.externalOrderNumber})`,
      });
    }
  }

  for (const order of input.orders) {
    const remessa = new Set(nfDigitsOf(order.notaRemessa));
    const historyDigits = new Set(
      order.history.flatMap((row) => nfDigitsOf(row.invoiceNumber)),
    );
    for (const current of nfDigitsOf(order.invoiceNumber)) {
      if (remessa.has(current)) continue;
      if (historyDigits.has(current)) continue;
      push({
        kind: 'invoice_sem_historico',
        orderId: order.id,
        orderCode: order.code,
        externalOrderNumber: order.externalOrderNumber,
        invoiceNumber: order.invoiceNumber,
        contaAzulVendaId: order.contaAzulVendaId,
        vendaNumero: null,
        vendaNumeroPedido: null,
        expectedOrderId: null,
        expectedExternal: null,
        nfDigits: current,
        motivo: `Order.invoiceNumber contém NF ${current} que não existe em OrderInvoiceHistory`,
      });
    }
  }

  const byKind: Record<NfVinculoMismatchKind, number> = {
    venda_outra_familia: 0,
    nf_outra_familia: 0,
    nf_duplicada_familias: 0,
    invoice_sem_historico: 0,
    parcela_ca_em_pedido_errado: 0,
  };
  for (const row of mismatches) byKind[row.kind] += 1;

  return {
    mismatches,
    ordersAffected: affected.size,
    byKind,
  };
}

export function planOldCompletedCleanup(
  orders: AuditOrderInput[],
): OldCompletedCleanupCandidate[] {
  const out: OldCompletedCleanupCandidate[] = [];
  for (const order of orders) {
    const status = String(order.status ?? '').toUpperCase();
    if (status === 'CANCELADO' || status === 'ARQUIVADO') continue;
    const nfs = orderNfDigits(order);
    if (nfs.length === 0) continue;
    const items = order.items ?? [];
    let faltaQty = 0;
    let itemsNeedingPick = 0;
    for (const it of items) {
      const picked = Math.max(it.pickedQty ?? 0, it.invoicedQty ?? 0);
      const falta = Math.max(0, it.quantity - picked);
      if (falta > 0) {
        itemsNeedingPick += 1;
        faltaQty += falta;
      }
    }
    const dirtyStatus =
      status === 'PARCIAL' ||
      status === 'EM_SEPARACAO' ||
      status === 'SEPARADO' ||
      status === 'AGUARDANDO_NF' ||
      status === 'NF_ATRELADA' ||
      status === 'EXPEDIDO';
    if (!dirtyStatus && faltaQty === 0) continue;
    out.push({
      orderId: order.id,
      orderCode: order.code,
      externalOrderNumber: order.externalOrderNumber,
      status: order.status,
      invoiceNumber: order.invoiceNumber,
      historyCount: nfs.length,
      itemsNeedingPick,
      faltaQty,
      reason: faltaQty > 0 ? 'falta_separacao' : 'status_intermediario',
    });
  }
  return out;
}

export function familyKey(raw: string | null | undefined): string | null {
  return wegOrderBase(raw) ?? (wegOrderDigits(raw) || null);
}
