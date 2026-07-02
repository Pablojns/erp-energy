import type {
  Despesa,
  ExtratoResponse,
  FinanceiroDashboard,
  HealthScore,
  NfDisplayStatus,
  NfEmAberto,
  NfsEmAbertoResponse,
  RevenueChartPoint,
  ChartGranularity,
} from '@/src/components/financeiro/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { normalizeDateRange } from '@/src/lib/period-range';

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value) || 0);
}

export function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildFinanceiroPeriodQuery(period: {
  dataInicio: string;
  dataFim: string;
}): string {
  const norm = normalizeDateRange(period);
  const qs = new URLSearchParams();
  if (norm.dataInicio.trim()) qs.set('dataInicio', norm.dataInicio.trim());
  if (norm.dataFim.trim()) qs.set('dataFim', norm.dataFim.trim());
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export function resolveEffectiveChartRange(
  dataInicio: string,
  dataFim: string,
  nfs: NfEmAberto[],
  extrato: ExtratoResponse,
): { dataInicio: string; dataFim: string } {
  if (dataInicio.trim() && dataFim.trim()) {
    return { dataInicio: dataInicio.trim(), dataFim: dataFim.trim() };
  }

  const dates: string[] = [];
  for (const nf of nfs) {
    dates.push(formatYmd(new Date(nf.dataEmissao)));
  }
  for (const item of extrato.items) {
    dates.push(formatYmd(new Date(item.data)));
  }

  if (dates.length === 0) {
    return defaultMonthRange();
  }

  dates.sort();
  return { dataInicio: dates[0], dataFim: dates[dates.length - 1] };
}

export function defaultMonthRange(): { dataInicio: string; dataFim: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { dataInicio: formatYmd(start), dataFim: formatYmd(end) };
}

export function ultimaNF(invoiceNumber: string): string {
  const partes = invoiceNumber.split('|');
  return partes[partes.length - 1].trim();
}

export function formatDateBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function categoriaLabel(categoria: string): string {
  const map: Record<string, string> = {
    FRETE: 'Frete',
    MATERIAL: 'Material',
    OPERACIONAL: 'Operacional',
    OUTROS: 'Outros',
  };
  return map[categoria] ?? categoria;
}

const CATEGORIA_COLORS = ['#7c6df0', '#38bdf8', '#f472b6', '#34d399', '#fbbf24'];

export function categoriaColor(categoria: string, index = 0): string {
  const key = categoria.toUpperCase();
  const map: Record<string, string> = {
    OPERACIONAL: CATEGORIA_COLORS[0],
    FRETE: CATEGORIA_COLORS[1],
    MATERIAL: CATEGORIA_COLORS[2],
    OUTROS: CATEGORIA_COLORS[3],
  };
  return map[key] ?? CATEGORIA_COLORS[index % CATEGORIA_COLORS.length];
}

export function nfDisplayStatus(nf: NfEmAberto): NfDisplayStatus {
  if (nf.diasEmAberto > 30) return 'CRITICO';
  if (nf.status === 'ATRASADO' || nf.diasEmAberto > 12) return 'ATRASADO';
  return 'ABERTO';
}

export function computeMargemBruta(dashboard: FinanceiroDashboard): number {
  if (dashboard.totalPago <= 0) return 0;
  return ((dashboard.totalPago - dashboard.despesasMes) / dashboard.totalPago) * 100;
}

export function computeHealthScore(dashboard: FinanceiroDashboard): HealthScore {
  const margem = computeMargemBruta(dashboard);
  const atrasoRatio =
    dashboard.totalEmAberto > 0
      ? dashboard.totalAtrasado / dashboard.totalEmAberto
      : 0;

  if (margem >= 18 && atrasoRatio <= 0.15) {
    return { grade: 'A+', label: 'Ótimo', tone: 'success' };
  }
  if (margem >= 8 && atrasoRatio <= 0.35) {
    return { grade: 'B', label: 'Atenção', tone: 'warning' };
  }
  return { grade: 'C', label: 'Crítico', tone: 'danger' };
}

export function computeTicketMedio(
  dashboard: FinanceiroDashboard,
  nfsInPeriod: number,
): number {
  const count = Math.max(1, nfsInPeriod);
  return (Number(dashboard.valorPedidosPeriodo) || 0) / count;
}

export async function fetchAllNfsEmAberto(): Promise<NfEmAberto[]> {
  const all: NfEmAberto[] = [];
  let page = 1;
  while (true) {
    const res = await erpFetchJson<NfsEmAbertoResponse>(
      `api/financeiro/nfs-em-aberto?page=${page}&pageSize=100`,
    );
    all.push(...res.data);
    if (page >= res.meta.totalPages) break;
    page += 1;
  }
  return all;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetweenInclusive(start: string, end: string): number {
  const a = parseYmd(start).getTime();
  const b = parseYmd(end).getTime();
  return Math.max(1, Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1);
}

export function resolveChartGranularity(dataInicio: string, dataFim: string): ChartGranularity {
  const days = daysBetweenInclusive(dataInicio, dataFim);
  if (days <= 7) return 'day';
  if (days <= 92) return 'week';
  return 'month';
}

function isoInRange(iso: string, start: string, end: string): boolean {
  const d = formatYmd(new Date(iso));
  return d >= start && d <= end;
}

function weekKey(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return formatYmd(d);
}

function bucketKey(iso: string, granularity: ChartGranularity): string {
  const d = new Date(iso);
  if (granularity === 'day') return formatYmd(d);
  if (granularity === 'week') return weekKey(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatBucketLabel(key: string, granularity: ChartGranularity): string {
  if (granularity === 'month') {
    const [y, m] = key.split('-');
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return months[Number(m) - 1] ?? key;
  }
  if (granularity === 'week') {
    const d = parseYmd(key);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }
  const d = parseYmd(key);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function enumerateBuckets(
  dataInicio: string,
  dataFim: string,
  granularity: ChartGranularity,
): string[] {
  const keys: string[] = [];
  const cur = parseYmd(dataInicio);
  const end = parseYmd(dataFim);

  while (cur.getTime() <= end.getTime()) {
    const key = bucketKey(cur.toISOString(), granularity);
    if (!keys.includes(key)) keys.push(key);
    if (granularity === 'day') cur.setDate(cur.getDate() + 1);
    else if (granularity === 'week') cur.setDate(cur.getDate() + 7);
    else cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
}

export function buildRevenueChartSeries(
  dataInicio: string,
  dataFim: string,
  nfs: NfEmAberto[],
  extrato: ExtratoResponse,
): RevenueChartPoint[] {
  const granularity = resolveChartGranularity(dataInicio, dataFim);
  const buckets = enumerateBuckets(dataInicio, dataFim, granularity);
  const faturadoMap = new Map<string, number>();
  const recebidoMap = new Map<string, number>();

  for (const nf of nfs) {
    if (!isoInRange(nf.dataEmissao, dataInicio, dataFim)) continue;
    const key = bucketKey(nf.dataEmissao, granularity);
    faturadoMap.set(key, (faturadoMap.get(key) ?? 0) + nf.valor);
  }

  for (const item of extrato.items) {
    if (item.tipo !== 'ENTRADA') continue;
    if (!isoInRange(item.data, dataInicio, dataFim)) continue;
    const key = bucketKey(item.data, granularity);
    recebidoMap.set(key, (recebidoMap.get(key) ?? 0) + item.valor);
    faturadoMap.set(key, (faturadoMap.get(key) ?? 0) + item.valor);
  }

  return buckets.map((key) => ({
    label: formatBucketLabel(key, granularity),
    faturado: faturadoMap.get(key) ?? 0,
    recebido: recebidoMap.get(key) ?? 0,
  }));
}

export function groupDespesasByCategoria(despesas: Despesa[]) {
  const map = new Map<string, number>();
  for (const d of despesas) {
    map.set(d.categoria, (map.get(d.categoria) ?? 0) + d.valor);
  }
  return [...map.entries()]
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a, b) => b.valor - a.valor);
}

export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function countNfsInPeriod(nfs: NfEmAberto[], dataInicio: string, dataFim: string): number {
  return filterNfsByPeriod(nfs, dataInicio, dataFim).length;
}

export function filterNfsByPeriod(
  nfs: NfEmAberto[],
  dataInicio: string,
  dataFim: string,
): NfEmAberto[] {
  if (!dataInicio.trim() || !dataFim.trim()) return nfs;
  return nfs.filter((nf) => isoInRange(nf.dataEmissao, dataInicio, dataFim));
}
