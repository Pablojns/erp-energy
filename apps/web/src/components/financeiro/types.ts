export type FinanceiroTab = 'dashboard' | 'nfs' | 'atraso' | 'despesas' | 'extrato';

export type NotaAbertaStatus =
  | 'VAZIO'
  | 'DECLARADO'
  | 'CONFIRMADO'
  | 'LEGADO';

export type NotaAbertaFonte = 'CONTA_AZUL' | 'PEDIDO' | 'AMBOS';

export type NotaAberta = {
  id: string;
  invoiceDigits: string;
  invoiceNumber: string;
  pedido: string;
  orderId: string | null;
  contaAzulTituloId: string | null;
  dataEmissao: string;
  vencimento: string;
  diasEmAberto: number;
  valor: number;
  fonte: NotaAbertaFonte;
  status: NotaAbertaStatus;
  legado: boolean;
  declaradoPagoEm: string | null;
  declaradoPagoValor: number | null;
  declaradoPagoDoc: string | null;
  confirmadoRecebidoEm: string | null;
  confirmadoRecebidoPor: string | null;
  confirmadoRecebidoOrigem: string | null;
  alertaVerificar: {
    data: string;
    valor: number;
    nome: string;
    historico: string;
  } | null;
  cobrancas?: Array<{
    id: string;
    enviadoEm: string;
    enviadoPara: string;
    enviadoPor: string | null;
  }>;
};

export type NotasAbertasResponse = {
  data: NotaAberta[];
  meta: { total: number; legadoOcultos: number };
};

export type WegImportPreviewMatch = {
  invoiceDigits: string;
  pedido: string;
  valor: number;
  pagoEm: string | null;
  docCompensacao: string | null;
  jaDeclarado: boolean;
  legado: boolean;
};

export type WegImportPreviewNotFound = {
  referencia: string;
  invoiceDigits: string;
  valor: number;
  pagoEm: string | null;
};

export type WegImportPreview = {
  totalLinhasComReferencia: number;
  matched: WegImportPreviewMatch[];
  notFound: WegImportPreviewNotFound[];
  skippedSemReferencia: number;
};

export type WegImportApplyResult = {
  applied: number;
  notFound: number;
  preview: WegImportPreview;
};

export type BankReconcileCreditHit = {
  date: string;
  amount: number;
  counterparty: string;
  historico: string;
  source: string;
  externalId: string;
};

export type BankReconcileNoteHit = {
  invoiceDigits: string;
  pedido: string;
  valor: number;
};

export type BankReconcilePreview = {
  wegIdentificados: number;
  autoMatches: Array<{
    credit: BankReconcileCreditHit;
    notes: BankReconcileNoteHit[];
    docCompensacao: string | null;
    groupAmount: number;
  }>;
  alerts: Array<{
    credit: BankReconcileCreditHit;
    notes: BankReconcileNoteHit[];
    reason: string;
  }>;
  wegSemNota: Array<{ credit: BankReconcileCreditHit }>;
  otherCredits: number;
};

export type BankReconcileApplyResult = {
  confirmed: number;
  alerts: number;
  wegSemNota: number;
  preview: BankReconcilePreview;
};

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
