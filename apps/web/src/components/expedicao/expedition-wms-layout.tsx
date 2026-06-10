'use client';

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

export type ExpeditionSummaryStrip = {
  pedidosHoje: number;
  prontosSeparar: number;
  comFalta: number;
  emSeparacao: number;
  aguardandoNf: number;
  finalizados: number;
};

export type OrderItemDtoShared = {
  lineNumber: number;
  sku: string;
  description: string;
  quantity: number;
  reservedQuantity: number;
  missingQty?: number;
  pickedQty?: number;
  stockStatus?: string;
};

export type OrderDtoMini = {
  status: OrderStatus;
  items: OrderItemDtoShared[];
};

export const SOURCE_LABEL: Record<OrderSource, string> = {
  WEG_MERCADO_ELETRONICO: 'WEG / ME',
  ECOMMERCE: 'E-commerce',
  SITE: 'Site',
  MANUAL: 'Manual',
};

export const STATUS_META: Record<
  OrderStatus,
  { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }
> = {
  NOVO: { label: 'Novo', tone: 'neutral' },
  ANALISADO: { label: 'Analisado', tone: 'info' },
  PARCIAL: { label: 'Parcial', tone: 'warning' },
  RESERVADO: { label: 'Reservado', tone: 'info' },
  EM_SEPARACAO: { label: 'Em separação', tone: 'info' },
  SEPARADO: { label: 'Separado', tone: 'info' },
  AGUARDANDO_NF: { label: 'Aguardando NF', tone: 'warning' },
  NF_ATRELADA: { label: 'NF atrelada', tone: 'success' },
  EXPEDIDO: { label: 'Expedido', tone: 'success' },
  FINALIZADO: { label: 'Finalizado', tone: 'success' },
  CANCELADO: { label: 'Cancelado', tone: 'danger' },
};

export function formatBrlDisplay(v: string | number) {
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(n);
}

export function formatDayDisplay(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function orderSeparationProgress(o: OrderDtoMini): {
  pct: number;
  picked: number;
  target: number;
} {
  let picked = 0;
  let target = 0;
  for (const it of o.items) {
    picked += it.pickedQty ?? 0;
    target += it.quantity;
  }
  const pct = target > 0 ? Math.round((picked / target) * 100) : 0;
  return { pct, picked, target };
}

export function itemStockLabelShared(st?: string): string {
  switch (st) {
    case 'COMPLETO':
      return 'Completo';
    case 'PARCIAL':
      return 'Parcial';
    case 'SEM_ESTOQUE':
      return 'Sem estoque';
    case 'NAO_ANALISADO':
      return 'Não analisado';
    case 'SKU_NAO_ENCONTRADO':
      return 'SKU pendente';
    default:
      return st ?? '—';
  }
}

export function cardGlowForExpeditionOrder(st: OrderStatus): string {
  switch (st) {
    case 'FINALIZADO':
    case 'EXPEDIDO':
      return 'erp-order-card erp-order-card--success';
    case 'NF_ATRELADA':
      return 'erp-order-card erp-order-card--success';
    case 'SEPARADO':
    case 'AGUARDANDO_NF':
      return 'erp-order-card erp-order-card--info';
    case 'EM_SEPARACAO':
      return 'erp-order-card erp-order-card--violet';
    case 'RESERVADO':
      return 'erp-order-card erp-order-card--info';
    case 'PARCIAL':
      return 'erp-order-card erp-order-card--warning';
    case 'CANCELADO':
      return 'erp-order-card erp-order-card--danger';
    default:
      return 'erp-order-card erp-order-card--default';
  }
}

/** Faixa rápida de KPIs para o topo da Expedição */
export function ExpeditionWmsKpiStrip(props: {
  loading: boolean;
  strip: ExpeditionSummaryStrip | null;
}) {
  const { loading, strip } = props;
  const cards: Array<{
    key: string;
    label: string;
    value: number;
    ring: 'sky' | 'indigo' | 'amber' | 'violet' | 'orange' | 'emerald';
  }> = [
    {
      key: 'hoje',
      label: 'Pedidos de hoje',
      value: strip?.pedidosHoje ?? 0,
      ring: 'sky',
    },
    {
      key: 'prontos',
      label: 'Prontos p/ separação',
      value: strip?.prontosSeparar ?? 0,
      ring: 'indigo',
    },
    {
      key: 'falta',
      label: 'Com falta',
      value: strip?.comFalta ?? 0,
      ring: 'amber',
    },
    {
      key: 'sep',
      label: 'Em separação',
      value: strip?.emSeparacao ?? 0,
      ring: 'violet',
    },
    {
      key: 'nf',
      label: 'Aguardando NF',
      value: strip?.aguardandoNf ?? 0,
      ring: 'orange',
    },
    {
      key: 'fin',
      label: 'Finalizados (total)',
      value: strip?.finalizados ?? 0,
      ring: 'emerald',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <div key={c.key} className="erp-kpi-card" data-ring={c.ring}>
          <p className="erp-kpi-label">{c.label}</p>
          <p
            className={`erp-kpi-value ${loading ? 'animate-pulse text-erp-fg-subtle' : ''}`}
          >
            {loading ? '—' : c.value.toLocaleString('pt-BR')}
          </p>
        </div>
      ))}
    </div>
  );
}
