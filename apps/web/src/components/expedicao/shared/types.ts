export type OrderSource =
  | 'WEG_MERCADO_ELETRONICO'
  | 'ECOMMERCE'
  | 'SITE'
  | 'MANUAL';

export type OrderStatus =
  | 'NOVO'
  | 'ANALISADO'
  | 'PARCIAL'
  | 'RESERVADO'
  | 'EM_SEPARACAO'
  | 'SEPARADO'
  | 'AGUARDANDO_NF'
  | 'NF_ATRELADA'
  | 'EXPEDIDO'
  | 'FINALIZADO'
  | 'CANCELADO';

export type InvoiceStatus =
  | 'NOT_FOUND'
  | 'PENDING'
  | 'INVOICED'
  | 'PARTIAL'
  | 'RECEIVED'
  | 'CHARGE_RECEIPT';

export type OrderItemDto = {
  id: string;
  lineNumber: number;
  sku: string;
  description: string;
  quantity: number;
  reservedQuantity: number;
  missingQty?: number;
  pickedQty?: number;
  invoicedQty?: number;
  availableAtAnalysis?: number | null;
  /** Status da linha na planilha WEG (Recebido, Em falta, etc.) */
  mercadoEletronicoItemStatus?: string | null;
  stockStatus?: string;
  unit: string | null;
  ncm: string | null;
  unitPrice: string;
  totalPrice: string;
  productId: string | null;
  stockQtyOnHand?: number | null;
  reservedQtyProduct?: number | null;
  availableQty?: number | null;
  stockAvailable: number | null;
  openNeed: number;
  stockCoversOpenNeed: boolean;
  product: {
    id: string;
    name: string;
    sku: string;
    stockQty: number;
    reservedQty?: number;
    availableQty?: number;
  } | null;
};

export type OrderDto = {
  id: string;
  source: OrderSource;
  code: string;
  externalOrderNumber: string | null;
  mercadoEletronicoNumber: string | null;
  customerName: string;
  customerDocument: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  receiverName: string | null;
  unloadingPoint: string | null;
  deliveryCnpj: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  notes: string | null;
  obsExpedicao?: string | null;
  notaRemessa: string | null;
  notaRemessaConfirmada: boolean;
  volumes: number | null;
  carrierId: string | null;
  carrierName: string | null;
  status: OrderStatus;
  priority: number;
  mercadoEletronicoStatus: string | null;
  contaAzulStatus: string | null;
  invoiceNumber: string | null;
  invoiceStatus: InvoiceStatus;
  orderDate: string | null;
  requestedDeliveryDate: string | null;
  totalValue: string;
  createdAt: string;
  updatedAt?: string | null;
  itemCount: number;
  quantitySum: number;
  physicalReservationActive?: boolean;
  stockReserveBlocked?: boolean;
  missingSkuForReserve?: boolean;
  integralReserveBlocked?: boolean;
  unidadesFaltantes?: number;
  isUrgentManual?: boolean;
  linkedOrderId?: string | null;
  linkedOrderDisplayNumber?: string | null;
  items: OrderItemDto[];
};

export type PaginatedOrders = {
  data: OrderDto[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type ExpeditionSummary = {
  totalPedidos: number;
  pedidosWeg: number;
  urgentes: number;
  atrasados: number;
  reservados: number;
  emSeparacao: number;
  aguardandoNf: number;
  faturados: number;
  cobrarRecebimento: number;
  valorTotal: string;
  estoqueReservadoTotal?: string;
  rupturaPedidos?: number;
};

export type FilterFormState = {
  search: string;
  source: 'all' | OrderSource;
  invoiceStatus: 'all' | InvoiceStatus;
  externalOrderNumber: string;
  deliveryCnpj: string;
  receiverName: string;
  unloadingPoint: string;
  sku: string;
  contaAzulStatus: string;
  invoiceNumber: string;
  orderDateFrom: string;
  orderDateTo: string;
  deliveryDateFrom: string;
  deliveryDateTo: string;
};

export type StatusFilterId =
  | 'all'
  | 'novo'
  | 'urgente'
  | 'atrasado'
  | 'aguardando_nf'
  | 'parcial'
  | 'aguardando_estoque'
  | 'pronto_separacao'
  | 'em_separacao'
  | 'finalizado'
  | 'cancelado';

export type UseExpeditionOrdersOptions = {
  mode?: 'expedition' | 'separation';
  initialStatusFilter?: StatusFilterId;
};

export type BannerState = { variant: 'error' | 'success'; message: string };
export type ToastState = {
  variant: 'ok' | 'err';
  message: string;
  durationMs?: number;
};

export type ProductPick = {
  id: string;
  name: string;
  sku: string;
  stockQty: number;
  price: string;
};

export type OrderBoardMode = 'expedition' | 'separation';

export type OrderActions = {
  reserveOrder: (id: string) => void | Promise<void>;
  sendToPicking: (id: string) => void | Promise<void>;
  markPicked: (id: string) => void | Promise<void>;
  attachInvoiceOrder: (id: string, invoiceNumber: string) => void | Promise<boolean | void>;
  finalizeExpeditionOrder: (id: string) => void | Promise<void>;
  confirmCancelOrder: (order: OrderDto) => void;
  patchOrderStatus: (id: string, status: OrderStatus) => void | Promise<void>;
  patchOrderCarrier: (
    order: OrderDto,
    carrierId: string | null,
  ) => void | Promise<void>;
  toggleOrderUrgent: (order: OrderDto) => void | Promise<void>;
  markLineSeparated: (
    orderId: string,
    itemId: string,
    qtyLine: number,
  ) => void | Promise<void>;
  markAllSeparatedFromReserved: (orderId: string) => void | Promise<void>;
  refreshAll: () => Promise<void>;
};

export type OrderExitItemDto = {
  id: string;
  lineNumber: number;
  sku: string;
  description: string;
  quantity: number;
  pickedQty: number;
};

export type OrderExitDto = {
  id: string;
  orderId: string;
  invoiceNumber: string;
  invoiceValue: string;
  exitDate: string;
  carrierName: string | null;
  trackingCode: string | null;
  punctuality: 'ON_TIME' | 'LATE';
  delayedDays: number;
  requestedDeliveryDate: string | null;
  createdAt: string;
  updatedAt: string;
  order: {
    id: string;
    code: string;
    externalOrderNumber: string | null;
    customerName: string;
    customerDocument: string | null;
    receiverName: string | null;
    unloadingPoint: string | null;
    deliveryAddress: string | null;
    deliveryCity: string | null;
    deliveryState: string | null;
    status: OrderStatus;
    totalValue: string;
    notes: string | null;
    obsExpedicao: string | null;
    notaRemessa: string | null;
    volumes: number | null;
    requestedDeliveryDate: string | null;
    carrierId: string | null;
    carrierName: string | null;
    items: OrderExitItemDto[];
  };
};

export type PaginatedOrderExits = {
  data: OrderExitDto[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
