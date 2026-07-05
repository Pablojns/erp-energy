export type PurchaseType = 'WEG_CONTRATO' | 'VENDA_EXTERNA' | 'MARKETPLACE';
export type PurchasePriority = 'URGENTE' | 'NORMAL';

export type KanbanColumnId =
  | 'SOLICITADO'
  | 'PEDIDO_ENVIADO_APROVADO'
  | 'PEDIDO_PAGO'
  | 'LAYOUT_APROVADO'
  | 'EM_PRODUCAO'
  | 'EXPEDIDO'
  | 'RECEBIDO';

export type PurchaseStatus =
  | KanbanColumnId
  | 'COMPRADO'
  | 'RECUSADO';

export type UserLite = { id: string; name: string; email: string };

export type ProductLite = {
  id: string;
  sku: string;
  name: string;
  internalCode?: string;
  stockQty: number;
  minStock: number;
  price?: string;
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
  itemName: string | null;
  quantity: number | null;
  clientDeadline: string | null;
  link: string | null;
  logoPlaceholder: string | null;
  images: PurchaseRequestImage[];
  supplierName: string | null;
  itemPrice: string | null;
  engravingPrice: string | null;
  saleOrderRef: string | null;
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

export const KANBAN_COLUMNS: Array<{ id: KanbanColumnId; label: string }> = [
  { id: 'SOLICITADO', label: 'Requisição de Compra' },
  { id: 'PEDIDO_ENVIADO_APROVADO', label: 'Pedido Enviado/Aprovado' },
  { id: 'PEDIDO_PAGO', label: 'Pedido Pago' },
  { id: 'LAYOUT_APROVADO', label: 'Layout Aprovado' },
  { id: 'EM_PRODUCAO', label: 'Em Produção' },
  { id: 'EXPEDIDO', label: 'Expedido' },
  { id: 'RECEBIDO', label: 'Recebido' },
];

export const TYPE_LABEL: Record<PurchaseType, string> = {
  WEG_CONTRATO: 'WEG',
  VENDA_EXTERNA: 'Venda Externa',
  MARKETPLACE: 'Marketplace',
};
