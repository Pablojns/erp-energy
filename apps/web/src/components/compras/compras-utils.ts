import type {
  KanbanColumnId,
  ProductLite,
  PurchasePriority,
  PurchaseRequest,
  PurchaseStatus,
  PurchaseType,
} from './compras-types';
import { KANBAN_COLUMNS } from './compras-types';

export function typeBadgeClass(type: PurchaseType) {
  if (type === 'WEG_CONTRATO') return 'border-blue-400/40 bg-blue-500/15 text-blue-200';
  if (type === 'VENDA_EXTERNA') return 'border-orange-400/40 bg-orange-500/15 text-orange-200';
  return 'border-purple-400/40 bg-purple-500/15 text-purple-200';
}

export function priorityBadgeClass(priority: PurchasePriority) {
  return priority === 'URGENTE'
    ? 'border-red-400/40 bg-red-500/15 text-red-200'
    : 'border-zinc-400/30 bg-zinc-500/15 text-zinc-200';
}

export function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatDateTime(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatMoney(value: string | null) {
  if (!value) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value));
}

export function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function productMatchesSearch(product: ProductLite, query: string) {
  const normalized = normalizeSearch(query);
  if (!normalized) return true;
  const haystack = normalizeSearch(`${product.sku} ${product.name} ${product.internalCode ?? ''}`);
  return normalized.split(/\s+/).every((token) => haystack.includes(token));
}

export function displayName(row: PurchaseRequest) {
  return row.product?.name ?? row.itemName ?? 'Item sem nome';
}

export function displayQty(row: PurchaseRequest) {
  return row.type === 'WEG_CONTRATO'
    ? row.suggestedQty ?? 1
    : row.quantity ?? 1;
}

export function calcPurchaseTotal(
  type: PurchaseType,
  qty: number | null | undefined,
  itemPrice: string | null | undefined,
): number | null {
  const quantity = qty ?? 0;
  const price = itemPrice ? Number(itemPrice) : 0;
  if (quantity <= 0 || !Number.isFinite(price) || price <= 0) return null;
  return quantity * price;
}

export function calcPurchaseTotalFromRow(row: PurchaseRequest): number | null {
  return calcPurchaseTotal(row.type, displayQty(row), row.itemPrice);
}

export function formatMoneyNumber(value: number | null) {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function kanbanColumnForStatus(status: PurchaseStatus): KanbanColumnId | null {
  if (status === 'RECUSADO') return null;
  if (status === 'COMPRADO') return 'PEDIDO_ENVIADO_APROVADO';
  if (KANBAN_COLUMNS.some((column) => column.id === status)) {
    return status as KanbanColumnId;
  }
  return 'SOLICITADO';
}

export function fieldClass(invalid?: boolean) {
  return `w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-indigo-400/50 ${
    invalid
      ? 'border-rose-500/70 bg-rose-500/10 text-white'
      : 'border-white/10 bg-white/5 text-white'
  }`;
}

export function purchaseImageSrc(requestId: string, imageId: string) {
  return `/api/erp/compras/${requestId}/imagem/${imageId}`;
}
