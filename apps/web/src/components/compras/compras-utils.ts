import type {
  KanbanColumnId,
  ProductLite,
  PurchaseRequest,
  PurchaseStage,
  PurchaseStatus,
  PurchaseType,
  SupplierLite,
} from './compras-types';
import { KANBAN_COLUMNS, purchaseStatusLabel } from './compras-types';
import { productMatchesSearch as matchProductSearch } from '@/src/lib/product-search';

export function productMatchesSearch(product: ProductLite, query: string) {
  return matchProductSearch(product, query);
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

export function displayEngravingVendor(row: PurchaseRequest): string | null {
  return row.engravingVendor?.trim() || null;
}

/** Minúsculas e sem acento, para comparar nomes escritos de formas diferentes. */
function normalizeSupplierText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Verifica se a solicitação é do fornecedor informado.
 *
 * Compara contra todas as origens do nome (campo livre + cadastro do produto),
 * não só a exibida, para não perder linhas em que o nome bate em outro campo.
 */
export function rowMatchesSupplier(row: PurchaseRequest, term: string): boolean {
  const needle = normalizeSupplierText(term);
  if (!needle) return true;

  const haystack = [
    row.supplierName,
    row.product?.supplier?.name,
    row.product?.supplierName,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeSupplierText)
    .join(' | ');

  return haystack.includes(needle);
}

/** Gravador terceirizado (ex.: "Amanda"), independente do fornecedor. */
export function rowMatchesEngravingVendor(
  row: PurchaseRequest,
  term: string,
): boolean {
  const needle = normalizeSupplierText(term);
  if (!needle) return true;
  const vendor = displayEngravingVendor(row);
  if (!vendor) return false;
  return normalizeSupplierText(vendor).includes(needle);
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

/**
 * Etapa (coluna) em que o card deve aparecer.
 * `status` guarda o id da etapa; 'COMPRADO' é status legado do endpoint
 * /comprado e cai na etapa que pede valor/data da compra.
 */
export function stageIdForStatus(
  status: string,
  stages: PurchaseStage[],
): string | null {
  if (stages.length === 0) return null;
  if (stages.some((stage) => stage.id === status)) return status;

  if (status === 'COMPRADO') {
    const comprado =
      stages.find((stage) => stage.id === 'PEDIDO_ENVIADO_APROVADO') ??
      stages.find((stage) => stage.requiresPurchaseDetails);
    if (comprado) return comprado.id;
  }

  // Etapa excluída ou status desconhecido: cai na primeira etapa.
  return stages[0]?.id ?? null;
}

export function stageLabel(status: string, stages: PurchaseStage[]): string {
  const stageId = stageIdForStatus(status, stages);
  const stage = stages.find((item) => item.id === stageId);
  return stage?.name ?? purchaseStatusLabel(status as PurchaseStatus);
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
