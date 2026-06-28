export type FinanceiroTab = 'dashboard' | 'nfs' | 'despesas' | 'extrato';

export type FinanceiroPeriod = {
  dataInicio: string;
  dataFim: string;
};

export type FinanceiroPeriodPreset = 'todos' | 'mes' | 'personalizado';

export type FinanceiroDashboard = {
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

export type NfEmAberto = {
  id: string;
  invoiceNumber: string;
  pedido: string;
  recebedor: string;
  valor: number;
  dataEmissao: string;
  diasEmAberto: number;
  status: string;
  observacao: string | null;
};

export type NfsEmAbertoResponse = {
  data: NfEmAberto[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type Despesa = {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data: string;
  fornecedor: string | null;
  observacao: string | null;
  createdAt?: string;
};

export type ExtratoItem = {
  id: string;
  tipo: 'ENTRADA' | 'SAIDA';
  descricao: string;
  valor: number;
  data: string;
  referencia?: string;
};

export type ExtratoResponse = {
  items: ExtratoItem[];
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
};

export const DESPESA_CATEGORIAS = [
  'FRETE',
  'MATERIAL',
  'OPERACIONAL',
  'OUTROS',
] as const;

export type DespesaCategoria = (typeof DESPESA_CATEGORIAS)[number];

export type NfDisplayStatus = 'ABERTO' | 'ATRASADO' | 'CRITICO';

export type HealthScore = {
  grade: string;
  label: string;
  tone: 'success' | 'warning' | 'danger';
};

export type ChartGranularity = 'day' | 'week' | 'month';

export type RevenueChartPoint = {
  label: string;
  faturado: number;
  recebido: number;
};
