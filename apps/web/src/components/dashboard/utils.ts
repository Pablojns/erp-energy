import type {
  DashboardAtividade,
  DashboardResumo,
  DateRange,
  FinanceiroDashboardData,
  MonthlyOrdersPoint,
  MonthlyTableRow,
  PeriodPreset,
  ProductListItem,
  StockMovementRow,
  StockSummaryData,
} from '@/src/components/dashboard/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function endOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

export function resolvePeriodRange(
  preset: PeriodPreset,
  custom?: Partial<DateRange>,
): DateRange {
  if (preset === 'todos') {
    return { dataInicio: '', dataFim: '' };
  }

  const now = new Date();

  if (preset === 'personalizado' && custom?.dataInicio && custom?.dataFim) {
    return { dataInicio: custom.dataInicio, dataFim: custom.dataFim };
  }

  if (preset === 'trimestre') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
    return { dataInicio: formatYmd(start), dataFim: formatYmd(now) };
  }

  if (preset === 'ano') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), 11, 31));
    return { dataInicio: formatYmd(start), dataFim: formatYmd(end) };
  }

  const start = startOfUtcMonth(now);
  const end = endOfUtcMonth(now);
  return { dataInicio: formatYmd(start), dataFim: formatYmd(end) };
}

export function buildPeriodQuery(range: DateRange): string {
  const qs = new URLSearchParams();
  if (range.dataInicio.trim()) qs.set('dataInicio', range.dataInicio.trim());
  if (range.dataFim.trim()) qs.set('dataFim', range.dataFim.trim());
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export function buildStockPeriodQuery(range: DateRange): string {
  const qs = new URLSearchParams();
  const now = new Date();
  const start = range.dataInicio.trim()
    ? range.dataInicio.trim()
    : formatYmd(new Date(Date.UTC(now.getUTCFullYear(), 0, 1)));
  const end = range.dataFim.trim() ? range.dataFim.trim() : formatYmd(now);
  qs.set('startDate', start);
  qs.set('endDate', end);
  return `?${qs.toString()}`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value) || 0)}%`;
}

export function formatLongDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

export function formatShortMonth(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(d);
}

export function formatDateBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  if (Number.isNaN(diffMs)) return '—';

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return sec <= 1 ? 'agora' : `${sec} seg atrás`;

  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? '1 min atrás' : `${min} min atrás`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? '1 h atrás' : `${hr} h atrás`;

  const days = Math.floor(hr / 24);
  return days === 1 ? '1 dia atrás' : `${days} dias atrás`;
}

export function computeVariationPct(current: number, previous: number): number {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

const REAL_ACTIVITY_ACTIONS = new Set([
  'ORDER_CREATED',
  'ORDER_UPDATED',
  'ORDER_STATUS_CHANGED',
  'ORDER_EXIT',
  'ORDER_EXIT_GENERATED',
  'ORDER_EXIT_DELETED',
  'STOCK_ADJUSTED',
  'STOCK_MOVEMENT_CREATED',
]);

const ACTION_LABELS: Record<string, string> = {
  ORDER_CREATED: 'Pedido criado',
  ORDER_UPDATED: 'Pedido atualizado',
  ORDER_STATUS_CHANGED: 'Pedido atualizado',
  ORDER_EXIT: 'Saída registrada',
  ORDER_EXIT_GENERATED: 'Saída registrada',
  ORDER_EXIT_DELETED: 'Saída removida',
  STOCK_ADJUSTED: 'Estoque ajustado',
  STOCK_MOVEMENT_CREATED: 'Estoque ajustado',
};

export function isRealActivity(action: string): boolean {
  if (action === 'DATA_ACCESS') return false;
  return REAL_ACTIVITY_ACTIONS.has(action);
}

export function translateActivityAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ').toLowerCase();
}

export function extractActivityEntityRef(item: DashboardAtividade): string {
  const changes = item.changes;
  if (changes && typeof changes === 'object' && changes !== null) {
    const c = changes as Record<string, unknown>;
    if (c.code) return String(c.code);
    if (c.externalOrderNumber) return String(c.externalOrderNumber);
    if (c.sku) return String(c.sku);
    if (c.invoiceNumber) return String(c.invoiceNumber);
  }
  return item.entityId.slice(0, 8);
}

export async function fetchDashboardResumo(range: DateRange): Promise<DashboardResumo> {
  return erpFetchJson<DashboardResumo>(`api/dashboard/resumo${buildPeriodQuery(range)}`);
}

export async function fetchFinanceiroDashboard(
  range: DateRange,
): Promise<FinanceiroDashboardData> {
  return erpFetchJson<FinanceiroDashboardData>(
    `api/financeiro/dashboard${buildPeriodQuery(range)}`,
  );
}

export async function fetchStockSummary(range: DateRange): Promise<StockSummaryData> {
  return erpFetchJson<StockSummaryData>(`stock/summary${buildStockPeriodQuery(range)}`);
}

async function fetchMonthBundle(monthDate: Date, isCurrent: boolean, isPrevious: boolean) {
  const start = formatYmd(startOfUtcMonth(monthDate));
  const end = formatYmd(endOfUtcMonth(monthDate));
  const q = `?dataInicio=${start}&dataFim=${end}`;
  const [fin, resumo] = await Promise.all([
    erpFetchJson<FinanceiroDashboardData>(`api/financeiro/dashboard${q}`),
    erpFetchJson<DashboardResumo>(`api/dashboard/resumo${q}`),
  ]);
  return {
    key: start.slice(0, 7),
    label: formatShortMonth(monthDate),
    value: Number(fin.valorPedidosPeriodo) || 0,
    faturado: Number(fin.valorFaturadoPeriodo) || 0,
    pedidos: Number(resumo.financeiro.totalPedidosMes) || 0,
    isCurrent,
    isPrevious,
  } satisfies MonthlyOrdersPoint;
}

export async function fetchMonthlyOrdersChart(): Promise<MonthlyOrdersPoint[]> {
  const now = new Date();
  const tasks: Promise<MonthlyOrdersPoint>[] = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    tasks.push(fetchMonthBundle(monthDate, offset === 0, offset === 1));
  }
  return Promise.all(tasks);
}

export function buildMonthlyTable(points: MonthlyOrdersPoint[]): MonthlyTableRow[] {
  return points.map((p, i) => {
    const prev = i > 0 ? Number(points[i - 1].value) || 0 : 0;
    return {
      ...p,
      variationPct: computeVariationPct(Number(p.value) || 0, prev),
    };
  });
}

export async function fetchCurrentAndPreviousMonth(): Promise<{
  current: number;
  previous: number;
}> {
  const now = new Date();
  const curStart = formatYmd(startOfUtcMonth(now));
  const curEnd = formatYmd(endOfUtcMonth(now));
  const prevDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevStart = formatYmd(startOfUtcMonth(prevDate));
  const prevEnd = formatYmd(endOfUtcMonth(prevDate));

  const [currentData, previousData] = await Promise.all([
    erpFetchJson<FinanceiroDashboardData>(
      `api/financeiro/dashboard?dataInicio=${curStart}&dataFim=${curEnd}`,
    ),
    erpFetchJson<FinanceiroDashboardData>(
      `api/financeiro/dashboard?dataInicio=${prevStart}&dataFim=${prevEnd}`,
    ),
  ]);

  return {
    current: Number(currentData.valorPedidosPeriodo) || 0,
    previous: Number(previousData.valorPedidosPeriodo) || 0,
  };
}

export async function fetchProductsForCategories(): Promise<ProductListItem[]> {
  type ProductsPage = {
    data: Array<Record<string, unknown>>;
  };
  const res = await erpFetchJson<ProductsPage>(
    'api/products?pageSize=100&status=active&sortBy=stockQty&sortOrder=asc',
  );
  return res.data.map((p) => ({
    id: String(p.id),
    sku: String(p.sku ?? ''),
    name: String(p.name ?? ''),
    category: p.category ? String(p.category) : null,
    stockQty: Number(p.stockQty) || 0,
    minStock: Number(p.minStock) || 0,
  }));
}

export async function fetchRecentStockMovements(range: DateRange): Promise<StockMovementRow[]> {
  type MovementPage = {
    data: Array<{
      id: string;
      movementType: string;
      quantity: number;
      movementDate: string;
      product: { sku: string; name: string };
      movedBy: { name: string } | null;
    }>;
  };

  try {
    const qs = buildStockPeriodQuery(range).replace('?', '');
    const res = await erpFetchJson<MovementPage>(
      `stock/movements?pageSize=10&page=1&${qs}`,
    );
    return res.data.map((m) => ({
      id: m.id,
      productName: m.product.name,
      productSku: m.product.sku,
      tipo: m.movementType === 'INBOUND' || m.movementType === 'ENTRADA' ? 'ENTRADA' : 'SAIDA',
      quantity: m.quantity,
      movementDate: m.movementDate,
      movedByName: m.movedBy?.name ?? null,
    }));
  } catch {
    const summary = await fetchStockSummary(range);
    return (summary.topInboundMovements ?? []).map((m) => ({
      id: m.id,
      productName: m.productName,
      productSku: m.productSku,
      tipo: 'ENTRADA' as const,
      quantity: m.quantity,
      movementDate: m.movementDate,
      movedByName: m.movedByName,
    }));
  }
}

export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))];
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const FLUXO_LABELS: Record<string, string> = {
  NOVO: 'Novo',
  EM_SEPARACAO: 'Em separação',
  AGUARDANDO_NF: 'Aguardando NF',
  FINALIZADO: 'Finalizado',
  PARCIAL: 'Parcial',
  CANCELADO: 'Cancelado',
};

export const FLUXO_COLORS: Record<string, string> = {
  NOVO: '#64748b',
  EM_SEPARACAO: '#2563eb',
  AGUARDANDO_NF: '#d97706',
  FINALIZADO: '#16a34a',
  PARCIAL: '#8b5cf6',
  CANCELADO: '#dc2626',
};

export const PIE_COLORS = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#8b5cf6',
  '#dc2626',
  '#0891b2',
  '#ca8a04',
  '#64748b',
];
