/** Normalização e validação de intervalos YYYY-MM-DD (UTC). */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function parseYmdUtc(ymd: string): Date {
  const [y, m, d] = ymd.trim().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatYmdUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function startOfUtcMonthFromYmd(ymd: string): string {
  const d = parseYmdUtc(ymd);
  return formatYmdUtc(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

export function endOfUtcMonthFromYmd(ymd: string): string {
  const d = parseYmdUtc(ymd);
  return formatYmdUtc(
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)),
  );
}

export type DateRangeInput = {
  dataInicio: string;
  dataFim: string;
};

export function normalizeDateRange(range: DateRangeInput): DateRangeInput {
  const dataInicio = range.dataInicio.trim();
  const dataFim = range.dataFim.trim();
  if (!dataInicio || !dataFim) {
    return { dataInicio, dataFim };
  }
  if (dataInicio > dataFim) {
    return { dataInicio: dataFim, dataFim: dataInicio };
  }
  return { dataInicio, dataFim };
}

export function isPeriodRangeValid(range: DateRangeInput): boolean {
  const dataInicio = range.dataInicio.trim();
  const dataFim = range.dataFim.trim();
  if (!dataInicio || !dataFim) return false;
  return dataInicio <= dataFim;
}

/** Ajusta a outra ponta quando o usuário inverte De/Até ao editar. */
export function adjustRangeOnDateChange(
  field: 'dataInicio' | 'dataFim',
  value: string,
  current: DateRangeInput,
): DateRangeInput {
  const next = { ...current, [field]: value };
  const inicio = next.dataInicio.trim();
  const fim = next.dataFim.trim();
  if (!inicio || !fim) return next;
  if (inicio <= fim) return next;

  if (field === 'dataFim') {
    return { dataInicio: startOfUtcMonthFromYmd(fim), dataFim: fim };
  }
  return { dataInicio: inicio, dataFim: endOfUtcMonthFromYmd(inicio) };
}

export function previousPeriodRange(range: DateRangeInput): DateRangeInput {
  const norm = normalizeDateRange(range);
  if (!norm.dataInicio || !norm.dataFim) {
    return { dataInicio: '', dataFim: '' };
  }
  const start = parseYmdUtc(norm.dataInicio);
  const end = parseYmdUtc(norm.dataFim);
  const msDay = 24 * 60 * 60 * 1000;
  const days =
    Math.round((end.getTime() - start.getTime()) / msDay) + 1;
  const prevEnd = new Date(start.getTime() - msDay);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * msDay);
  return {
    dataInicio: formatYmdUtc(prevStart),
    dataFim: formatYmdUtc(prevEnd),
  };
}

export function formatPeriodShortLabel(ymd: string): string {
  const d = parseYmdUtc(ymd);
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}
