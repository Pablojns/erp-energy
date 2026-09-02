export type PurchaseType = 'WEG_CONTRATO' | 'VENDA_EXTERNA' | 'MARKETPLACE';
export type PurchasePriority = 'URGENTE' | 'NORMAL';

export type KanbanColumnId =
  | 'SOLICITADO'
  | 'PEDIDO_ENVIADO_APROVADO'
  | 'PEDIDO_PAGO'
  | 'LAYOUT_APROVADO'
  | 'EM_PRODUCAO'
  | 'EXPEDIDO'
  | 'RECEBIDO'
  | 'RECUSADO';

export type PurchaseStatus =
  | KanbanColumnId
  | 'COMPRADO';

/** Etapa customizável do Kanban (PurchaseStage na API). */
export type PurchaseStage = {
  id: string;
  name: string;
  order: number;
  color: string | null;
  /** Pede valor e data da compra ao mover um card para cá. */
  requiresPurchaseDetails: boolean;
  /** Pede um motivo ao mover um card para cá. */
  requiresReason: boolean;
  createdAt: string;
};

export type UserLite = { id: string; name: string; email: string };

export type ProductLite = {
  id: string;
  sku: string;
  name: string;
  internalCode?: string;
  stockQty: number;
  minStock: number;
  /** Preço de venda (não usar em Compras WEG). */
  price?: string;
  /** Preço base / custo pago ao fornecedor. */
  cost?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  supplier?: { id: string; name: string } | null;
  /** SKU/código no catálogo do fornecedor. */
  supplierSku?: string | null;
};

export type SupplierLite = {
  id: string;
  name: string;
  isActive: boolean;
};

export type PurchaseRequestImage = {
  id: string;
  imageKey: string;
  url: string | null;
  createdAt: string;
};

export type PurchaseRequest = {
  id: string;
  type: PurchaseType;
  status: PurchaseStatus;
  priority: PurchasePriority;
  productId: string | null;
  product: ProductLite | null;
  suggestedQty: number | null;
  sku: string | null;
  /** CodigoComposto (SAP) do catálogo XBZ, quando o SKU existe lá. */
  compositeCode?: string | null;
  itemName: string | null;
  quantity: number | null;
  customerName: string | null;
  clientDeadline: string | null;
  link: string | null;
  logoPlaceholder: string | null;
  images: PurchaseRequestImage[];
  supplierName: string | null;
  /** Gravador terceirizado (ex.: "Amanda"), independente do fornecedor. */
  engravingVendor?: string | null;
  itemPrice: string | null;
  engravingPrice: string | null;
  saleOrderRef: string | null;
  quoteId?: string | null;
  quoteItemId?: string | null;
  /** Foto do produto no orçamento/catálogo */
  productImageUrl?: string | null;
  /** Nome da técnica de gravação (ex: Transfer) */
  engravingName?: string | null;
  deliveryAddress?: string | null;
  expectedArrival: string | null;
  observation: string | null;
  requestedBy: UserLite;
  resolvedBy: UserLite | null;
  resolvedAt: string | null;
  purchasedAt: string | null;
  purchaseValue: string | null;
  refusalReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseListResponse = {
  data: PurchaseRequest[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

export type ProductListResponse = {
  data: ProductLite[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

/**
 * Etapas seed, usadas apenas como fallback (ex.: dashboard e rótulos quando a
 * lista de etapas ainda não carregou). O Kanban renderiza a partir da API.
 */
export const KANBAN_COLUMNS: Array<{ id: KanbanColumnId; label: string }> = [
  { id: 'SOLICITADO', label: 'Requisição de Compra' },
  { id: 'PEDIDO_ENVIADO_APROVADO', label: 'Pedido Enviado/Aprovado' },
  { id: 'PEDIDO_PAGO', label: 'Pedido Pago' },
  { id: 'LAYOUT_APROVADO', label: 'Layout Aprovado' },
  { id: 'EM_PRODUCAO', label: 'Em Produção' },
  { id: 'EXPEDIDO', label: 'Expedido' },
  { id: 'RECEBIDO', label: 'Recebido' },
  { id: 'RECUSADO', label: 'Finalizado' },
];

export const TYPE_LABEL: Record<PurchaseType, string> = {
  WEG_CONTRATO: 'WEG',
  VENDA_EXTERNA: 'Venda Externa',
  MARKETPLACE: 'Marketplace',
};

/** Opções do filtro "Tipo" — inclui todos os types válidos da API. */
export const TYPE_FILTER_OPTIONS: Array<{ value: 'all' | PurchaseType; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'WEG_CONTRATO', label: 'WEG' },
  { value: 'VENDA_EXTERNA', label: 'Venda Externa' },
  { value: 'MARKETPLACE', label: 'Marketplace' },
];

/**
 * Fornecedores do filtro de Compras.
 *
 * `supplierName` e `engravingVendor` são texto livre. Cada opção usa um `term`
 * distintivo, sem acento, comparado de forma parcial e case-insensitive.
 * Amanda filtra pelo gravador (onde o item está fisicamente), não pelo
 * fornecedor do produto (XBZ / Ásia Imports).
 */
export const SUPPLIER_FILTER_OPTIONS: Array<{
  value: string;
  label: string;
  term: string;
  match: 'supplier' | 'engravingVendor';
}> = [
  { value: 'all', label: 'Todos', term: '', match: 'supplier' },
  { value: 'XBZ', label: 'XBZ', term: 'XBZ', match: 'supplier' },
  { value: 'SPOT', label: 'SPOT', term: 'SPOT', match: 'supplier' },
  { value: 'AMANDA', label: 'Amanda', term: 'Amanda', match: 'engravingVendor' },
  { value: 'ASIA_IMPORTS', label: 'Ásia Imports', term: 'Imports', match: 'supplier' },
];

/** Agrupamento operacional do Dashboard: onde buscar o item (SPOT ou Amanda). */
export const DASHBOARD_LOCATION_OPTIONS = SUPPLIER_FILTER_OPTIONS.filter(
  (option) => option.value === 'SPOT' || option.value === 'AMANDA',
);

export function supplierFilterTerm(value: string): string {
  return SUPPLIER_FILTER_OPTIONS.find((option) => option.value === value)?.term ?? '';
}

export function supplierFilterMatch(
  value: string,
): 'supplier' | 'engravingVendor' {
  return (
    SUPPLIER_FILTER_OPTIONS.find((option) => option.value === value)?.match ??
    'supplier'
  );
}

export function typeLabel(type: string): string {
  if (type in TYPE_LABEL) return TYPE_LABEL[type as PurchaseType];
  return type;
}

export function purchaseStatusLabel(status: PurchaseStatus): string {
  if (status === 'COMPRADO') return 'Pedido Enviado/Aprovado';
  const fromKanban = KANBAN_COLUMNS.find((column) => column.id === status);
  if (fromKanban) return fromKanban.label;
  return status;
}
