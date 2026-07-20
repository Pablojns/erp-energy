import type {
  KanbanColumnId,
  ProductLite,
  PurchasePriority,
  PurchaseRequest,
  PurchaseStatus,
  PurchaseType,
  SupplierLite,
} from './compras-types';
import { KANBAN_COLUMNS } from './compras-types';

export function typeBadgeClass(type: PurchaseType): 'info' | 'warning' | 'accent' {
  if (type === 'WEG_CONTRATO') return 'info';
  if (type === 'VENDA_EXTERNA') return 'warning';
  return 'accent';
}

export function priorityBadgeClass(priority: PurchasePriority): 'danger' | 'neutral' {
  return priority === 'URGENTE' ? 'danger' : 'neutral';
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

export function displaySupplierName(row: PurchaseRequest): string | null {
  return (
    row.supplierName?.trim() ||
    row.product?.supplier?.name?.trim() ||
    row.product?.supplierName?.trim() ||
    null
  );
}

export function resolveSupplierForProduct(
  product: ProductLite,
  suppliers: SupplierLite[],
): string | null {
  if (product.supplierName?.trim()) return product.supplierName.trim();

  if (product.supplierId) {
    const linked = suppliers.find((supplier) => supplier.id === product.supplierId);
    if (linked) return linked.name;
  }

  const haystack = `${product.name} ${product.sku} ${product.internalCode ?? ''}`.toUpperCase();
  const sorted = [...suppliers].sort((a, b) => b.name.length - a.name.length);
  for (const supplier of sorted) {
    const name = supplier.name.trim();
    if (name.length >= 2 && haystack.includes(name.toUpperCase())) {
      return name;
    }
  }

  return null;
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
  const price = itemPrice ? Number(String(itemPrice).replace(',', '.')) : NaN;
  if (quantity <= 0 || !Number.isFinite(price) || price < 0) return null;
  return quantity * price;
}

export function productBaseCost(product: ProductLite | null | undefined): string {
  const raw = product?.cost?.trim();
  if (raw && Number.isFinite(Number(raw))) return raw;
  return '0';
}

export function purchaseUnitPrice(row: PurchaseRequest): string {
  if (row.type === 'WEG_CONTRATO') {
    const fromProduct = row.product?.cost?.trim();
    if (fromProduct && Number.isFinite(Number(fromProduct))) return fromProduct;
    const fromRequest = row.itemPrice?.trim();
    if (fromRequest && Number.isFinite(Number(fromRequest))) return fromRequest;
    return '0';
  }
  return row.itemPrice?.trim() ?? '';
}

export function calcPurchaseTotalFromRow(row: PurchaseRequest): number | null {
  return calcPurchaseTotal(row.type, displayQty(row), purchaseUnitPrice(row));
}

export function calcEngravingTotalFromRow(row: PurchaseRequest): number | null {
  return calcPurchaseTotal(row.type, displayQty(row), row.engravingPrice);
}

export function calcPaidTotalFromRow(row: PurchaseRequest): number | null {
  const value = row.purchaseValue ? Number(row.purchaseValue) : 0;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function formatMoneyNumber(value: number | null) {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function kanbanColumnForStatus(status: PurchaseStatus): KanbanColumnId | null {
  if (status === 'COMPRADO') return 'PEDIDO_ENVIADO_APROVADO';
  if (status === 'RECUSADO') return 'RECUSADO';
  if (KANBAN_COLUMNS.some((column) => column.id === status)) {
    return status as KanbanColumnId;
  }
  return 'SOLICITADO';
}

export function fieldClass(invalid?: boolean) {
  return `erp-module-input ${invalid ? 'border-[color-mix(in_srgb,var(--erp-danger)_70%,transparent)] bg-[var(--erp-danger-soft)]' : ''}`;
}

export function purchaseImageSrc(
  requestId: string,
  imageId: string,
  signedUrl?: string | null,
) {
  if (signedUrl?.trim()) return signedUrl.trim();
  return `/api/erp/compras/${requestId}/imagem/${imageId}`;
}
