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

export type PeriodPreset = 'todos' | 'mes' | 'trimestre' | 'ano' | 'personalizado';

export type DateRange = {
  dataInicio: string;
  dataFim: string;
};
