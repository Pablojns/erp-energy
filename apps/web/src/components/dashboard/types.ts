export type DashboardTabId =
  | 'overview'
  | 'financeiro'
  | 'expedicao'
  | 'estoque';

export type DashboardFluxo = {
  NOVO: number;
  EM_SEPARACAO: number;
  AGUARDANDO_NF: number;
  FINALIZADO: number;
  PARCIAL: number;
  CANCELADO: number;
};

export type DashboardRankingItem = {
  nome: string;
  total: number;
};

export type DashboardAtividade = {
  action: string;
  userId: string;
  entityId: string;
  createdAt: string;
  changes: unknown;
};

export type DashboardResumo = {
  financeiro: {
    valorPedidosPeriodo: number;
    valorFaturadoPeriodo: number;
    valorPedidosHistorico: number;
    valorFaturadoHistorico: number;
    ticketMedio: number;
    totalPedidosMes: number;
    totalPedidosTodos: number;
    pedidosConcluidos: number;
    pedidosAtrasados: number;
    taxaSLA: number;
  };
  fluxo: DashboardFluxo;
  topRecebedores: DashboardRankingItem[];
  topTransportadoras: DashboardRankingItem[];
  pedidosSemNF: number;
  atividadesRecentes: DashboardAtividade[];
  alertas: {
    pedidosUrgentes: number;
    pedidosAtrasados: number;
    pedidosSemNF: number;
  };
};

export type FinanceiroDashboardData = {
  valorPedidosPeriodo: number;
  valorFaturadoPeriodo: number;
  valorPedidosHistorico: number;
  valorFaturadoHistorico: number;
  totalEmAberto: number;
  totalAtrasado: number;
  totalPago: number;
  despesasMes: number;
  lucroBruto: number;
};

export type StockSummaryData = {
  activeProducts: number;
  inactiveProducts: number;
  totalUnitsOnHand: number;
  skusBelowMinStock: number;
  valorEstoque: number;
  valorVenda: number;
  criticalProducts?: Array<{
    id: string;
    sku: string;
    name: string;
    stockQty: number;
    minStock: number;
    deficit: number;
  }>;
  topInboundMovements?: Array<{
    id: string;
    movementDate: string;
    quantity: number;
    productSku: string;
    productName: string;
    movedByName: string | null;
  }>;
};

export type MonthlyOrdersPoint = {
  key: string;
  label: string;
  value: number;
  faturado?: number;
  pedidos?: number;
  isCurrent: boolean;
  isPrevious: boolean;
};

export type MonthlyTableRow = MonthlyOrdersPoint & {
  variationPct: number;
};

export type DelayedOrderRow = {
  id: string;
  pedido: string;
  recebedor: string;
  diasAtraso: number;
};

export type PeriodPreset = 'todos' | 'mes' | 'trimestre' | 'ano' | 'personalizado';

export type OverviewModuleFilter = 'geral' | 'expedicao' | 'estoque' | 'financeiro';

export type DateRange = {
  dataInicio: string;
  dataFim: string;
};

export type NfAlertRow = {
  id: string;
  pedido: string;
  valor: number;
  diasEmAberto: number;
};

export type ProductListItem = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  stockQty: number;
  minStock: number;
};

export type StockMovementRow = {
  id: string;
  productName: string;
  productSku: string;
  tipo: 'ENTRADA' | 'SAIDA';
  quantity: number;
  movementDate: string;
  movedByName: string | null;
};

export type OverviewAlertItem = {
  id: string;
  tone: 'danger' | 'warning';
  title: string;
  tab: DashboardTabId;
};
