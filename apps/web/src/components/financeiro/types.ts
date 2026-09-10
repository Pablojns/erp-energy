export type FinanceiroTab = 'dashboard' | 'nfs' | 'atraso' | 'despesas' | 'extrato';

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
  fonte?: 'conta_azul' | 'erp';
};

export type NfEmAberto = {
  id: string;
  rowKey?: string;
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

export type ContaAtrasoTone = 'critico' | 'atencao' | 'normal';

export type ContaAtrasoTitulo = {
  id: string;
  invoiceNumber: string;
  pedido: string;
  cnpj: string;
  cnpjKey: string;
  valor: number;
  dataEmissao: string;
  dueDate: string;
  diasAtraso: number;
  tone: ContaAtrasoTone;
};

export type ContaAtrasoGrupo = {
  cnpj: string;
  cnpjKey: string;
  titulos: number;
  valorTotal: number;
  diasAtrasoMaisAntigo: number;
  tone: ContaAtrasoTone;
  itens: ContaAtrasoTitulo[];
};

export type ContasAtrasoResponse = {
  grupos: ContaAtrasoGrupo[];
  totalClientes: number;
  totalTitulos: number;
  valorTotal: number;
};

export type ReconciliacaoEstoqueGap = {
  orderId: string;
  pedido: string;
  invoiceNumber: string | null;
  message: string;
};

export type ReconciliacaoEstoqueResponse = {
  gaps: ReconciliacaoEstoqueGap[];
  total: number;
};
