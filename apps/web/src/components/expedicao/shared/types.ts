export type OrderSource =
  | 'WEG_MERCADO_ELETRONICO'
  | 'ECOMMERCE'
  | 'SITE'
  | 'VENDA_EXTERNA'
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
  customerId?: string | null;
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
  companyEntityId?: string | null;
  companyEntityName?: string | null;
  companyEntityCnpj?: string | null;
  trackingCode?: string | null;
  status: OrderStatus;
  priority: number;
  mercadoEletronicoStatus: string | null;
  contaAzulStatus: string | null;
  invoiceNumber: string | null;
  invoiceStatus: InvoiceStatus;
  orderDate: string | null;
  requestedDeliveryDate: string | null;
  /** Momento em que o pedido entrou na fila de separação. */
  sentToSeparationAt?: string | null;
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
  /** Saídas já registradas (uma por ciclo de separação), da mais recente à mais antiga. */
  saidas?: OrderExitHistoryDto[];
  items: OrderItemDto[];
};

export type OrderExitHistoryDto = {
  id: string;
  invoiceNumber: string | null;
  invoiceValue: string | null;
  exitDate: string | null;
  carrierName: string | null;
  trackingCode: string | null;
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

export type PedidosFilterField =
  | ''
  | 'invoiceNumber'
  | 'receiverName'
  | 'unloadingPoint';

export type FilterFormState = {
  search: string;
  filterField: PedidosFilterField;
  filterValue: string;
  source: 'all' | OrderSource;
  invoiceStatus: 'all' | InvoiceStatus;
  externalOrderNumber: string;
  deliveryCnpj: string;
  receiverName: string;
  unloadingPoint: string;
  carrierName: string;
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
  | 'cancelado'
  /** Etapas da fila de Separação. */
  | 'sep_em_separacao'
  | 'sep_falta_nf'
  | 'sep_falta_etiqueta'
  | 'sep_aguardando_saida';

export type UseExpeditionOrdersOptions = {
  mode?: 'expedition' | 'separation';
  initialStatusFilter?: StatusFilterId;
  /** Fonte padrão da fila (evita busca dupla no mount da aba Pedidos). */
  initialOrderSource?: FilterFormState['source'];
  /** Pré-preenche a busca textual da fila (ex.: link da busca global). */
  initialSearch?: string;
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
  romaneioAt: string | null;
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
