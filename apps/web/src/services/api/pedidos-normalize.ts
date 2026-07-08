import type { OrderDto, OrderItemDto } from '@/src/components/expedicao/shared/types';

function normalizeDeliveryAddress(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') return raw.trim() || null;
  if (typeof raw === 'object') {
    return JSON.stringify(raw);
  }
  return String(raw);
}

/** Resposta serializada (GET /api/pedidos) ou registro bruto da fila (Prisma JSON). */
export function normalizePedidoFromApi(raw: Record<string, unknown>): OrderDto {
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const items = itemsRaw.map((it) => normalizeItemFromApi(it as Record<string, unknown>));

  const qtySum = items.reduce((a, x) => a + x.quantity, 0);
  const unidadesFaltantes = items.reduce((a, x) => a + (x.missingQty ?? 0), 0);

  return {
    id: String(raw.id),
    source: (raw.source as OrderDto['source']) ?? 'WEG_MERCADO_ELETRONICO',
    code: String(raw.code ?? ''),
    externalOrderNumber: raw.externalOrderNumber
      ? String(raw.externalOrderNumber)
      : null,
    mercadoEletronicoNumber: raw.mercadoEletronicoNumber
      ? String(raw.mercadoEletronicoNumber)
      : null,
    customerName: String(raw.customerName ?? '—'),
    customerDocument: raw.customerDocument ? String(raw.customerDocument) : null,
    customerCity: raw.customerCity ? String(raw.customerCity) : null,
    customerState: raw.customerState ? String(raw.customerState) : null,
    receiverName: raw.receiverName ? String(raw.receiverName) : null,
    unloadingPoint: raw.unloadingPoint ? String(raw.unloadingPoint) : null,
    deliveryCnpj: raw.deliveryCnpj ? String(raw.deliveryCnpj) : null,
    deliveryAddress: normalizeDeliveryAddress(raw.deliveryAddress),
    deliveryCity: raw.deliveryCity ? String(raw.deliveryCity) : null,
    deliveryState: raw.deliveryState ? String(raw.deliveryState) : null,
    notes: raw.notes ? String(raw.notes) : null,
    notaRemessa: raw.notaRemessa ? String(raw.notaRemessa) : null,
    notaRemessaConfirmada: Boolean(raw.notaRemessaConfirmada),
    volumes:
      raw.volumes !== null && raw.volumes !== undefined && raw.volumes !== ''
        ? Number(raw.volumes)
        : null,
    carrierId: raw.carrierId ? String(raw.carrierId) : null,
    carrierName: raw.carrierName ? String(raw.carrierName) : null,
    trackingCode: raw.trackingCode ? String(raw.trackingCode) : null,
    status: (raw.status as OrderDto['status']) ?? 'NOVO',
    priority: Number(raw.priority ?? 3),
    mercadoEletronicoStatus: raw.mercadoEletronicoStatus
      ? String(raw.mercadoEletronicoStatus)
      : null,
    contaAzulStatus: raw.contaAzulStatus ? String(raw.contaAzulStatus) : null,
    invoiceNumber: raw.invoiceNumber ? String(raw.invoiceNumber) : null,
    invoiceStatus: (raw.invoiceStatus as OrderDto['invoiceStatus']) ?? 'NOT_FOUND',
    orderDate: toIsoString(raw.orderDate),
    requestedDeliveryDate: toIsoString(raw.requestedDeliveryDate),
    totalValue: decimalToString(raw.totalValue),
    createdAt: toIsoString(raw.createdAt) ?? new Date().toISOString(),
    itemCount: Number(raw.itemCount ?? items.length),
    quantitySum: Number(raw.quantitySum ?? qtySum),
    physicalReservationActive: Boolean(raw.physicalReservationActive),
    stockReserveBlocked: Boolean(raw.stockReserveBlocked),
    missingSkuForReserve: Boolean(raw.missingSkuForReserve),
    integralReserveBlocked: Boolean(raw.integralReserveBlocked),
    unidadesFaltantes: Number(raw.unidadesFaltantes ?? unidadesFaltantes),
    isUrgentManual: Boolean(raw.isUrgentManual),
    linkedOrderId: raw.linkedOrderId ? String(raw.linkedOrderId) : null,
    linkedOrderDisplayNumber: raw.linkedOrderDisplayNumber
      ? String(raw.linkedOrderDisplayNumber)
      : null,
    items,
  };
}

/** Item serializado (GET /api/pedidos/:id/itens ou em `items` do pedido). */
export function normalizeItemFromApi(it: Record<string, unknown>): OrderItemDto {
  const pq = it.product && typeof it.product === 'object'
    ? (it.product as Record<string, unknown>).stockQty
    : it.stockQtyOnHand;
  const pr = it.product && typeof it.product === 'object'
    ? (it.product as Record<string, unknown>).reservedQty
    : it.reservedQtyProduct;
  const stockQty = pq !== undefined && pq !== null ? Number(pq) : null;
  const reservedQtyP = pr !== undefined && pr !== null ? Number(pr) : null;
  const availableQty =
    stockQty !== null && reservedQtyP !== null ? stockQty - reservedQtyP : stockQty;

  return {
    id: String(it.id),
    lineNumber: Number(it.lineNumber ?? 0),
    sku: String(it.sku ?? ''),
    description: String(it.description ?? ''),
    quantity: Number(it.quantity ?? 0),
    reservedQuantity: Number(it.reservedQuantity ?? 0),
    missingQty: Number(it.missingQty ?? 0),
    pickedQty: Number(it.pickedQty ?? 0),
    invoicedQty: Number(it.invoicedQty ?? 0),
    availableAtAnalysis:
      it.availableAtAnalysis !== undefined && it.availableAtAnalysis !== null
        ? Number(it.availableAtAnalysis)
        : null,
    mercadoEletronicoItemStatus: it.mercadoEletronicoItemStatus
      ? String(it.mercadoEletronicoItemStatus)
      : null,
    stockStatus: it.stockStatus ? String(it.stockStatus) : undefined,
    unit: it.unit ? String(it.unit) : null,
    ncm: it.ncm ? String(it.ncm) : null,
    unitPrice: decimalToString(it.unitPrice),
    totalPrice: decimalToString(it.totalPrice),
    productId: it.productId ? String(it.productId) : null,
    stockQtyOnHand: stockQty,
    reservedQtyProduct: reservedQtyP,
    availableQty,
    stockAvailable: availableQty,
    openNeed: Math.max(0, Number(it.quantity ?? 0) - Number(it.reservedQuantity ?? 0)),
    stockCoversOpenNeed:
      availableQty !== null
        ? availableQty >= Number(it.quantity ?? 0)
        : false,
    product:
      it.product && typeof it.product === 'object'
        ? {
            id: String((it.product as Record<string, unknown>).id),
            name: String((it.product as Record<string, unknown>).name ?? ''),
            sku: String((it.product as Record<string, unknown>).sku ?? ''),
            stockQty: Number((it.product as Record<string, unknown>).stockQty ?? 0),
            reservedQty: Number(
              (it.product as Record<string, unknown>).reservedQty ?? 0,
            ),
            availableQty:
              Number((it.product as Record<string, unknown>).stockQty ?? 0) -
              Number((it.product as Record<string, unknown>).reservedQty ?? 0),
          }
        : null,
  };
}

function toIsoString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function decimalToString(v: unknown): string {
  if (v === null || v === undefined) return '0';
  if (typeof v === 'object' && v !== null && 'toString' in v) {
    return (v as { toString: () => string }).toString();
  }
  return String(v);
}

/** Extrai só os dígitos da NF (ex.: "1 - 1897" → "1897", "12345/1" → "12345"). */
export function normalizeInvoiceNumberDigits(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';

  let part = trimmed.split('/')[0]?.trim() ?? trimmed;
  const dashMatch = part.match(/[-–—]\s*(.+)$/);
  if (dashMatch?.[1]) {
    part = dashMatch[1].trim();
  }
  return part.replace(/\D/g, '');
}

export function numeroPedFromOrder(order: {
  externalOrderNumber?: string | null;
  code?: string;
}): string | null {
  const raw = order.externalOrderNumber?.trim();
  if (raw) return raw;
  const code = order.code?.trim();
  return code || null;
}

export function pedidoApiUrl(numeroPed: string, ...pathParts: string[]): string {
  return [
    'api',
    'pedidos',
    encodeURIComponent(numeroPed),
    ...pathParts.map((part) => encodeURIComponent(part)),
  ].join('/');
}

/** GET de listagens de pedidos — sem cache do fetch/Next. */
export const pedidosListFetchInit: RequestInit = { cache: 'no-store' };
