import type { DateRange, PeriodPreset } from '@/src/components/dashboard/types';

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

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

export function formatLongDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
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

export function slaTone(value: number): 'success' | 'warning' | 'danger' {
  if (value > 80) return 'success';
  if (value > 60) return 'warning';
  return 'danger';
}

export const FLUXO_LABELS: Record<string, string> = {
  NOVO: 'Novo',
  EM_SEPARACAO: 'Em separação',
  AGUARDANDO_NF: 'Aguardando NF',
  FINALIZADO: 'Finalizado',
  PARCIAL: 'Parcial',
  CANCELADO: 'Cancelado',
};
