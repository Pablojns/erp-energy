const BRT_TIMEZONE = 'America/Sao_Paulo';

export function getBrtParts(date = new Date()): {
  hour: number;
  minute: number;
  year: number;
  month: number;
  day: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: BRT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const read = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

/** Horário comercial: 07:00–19:00 (horário de Brasília). */
export function isBusinessHours(date = new Date()): boolean {
  const { hour } = getBrtParts(date);
  return hour >= 7 && hour < 19;
}

export function isMorningDigestHour(date = new Date()): boolean {
  const { hour } = getBrtParts(date);
  return hour === 7;
}

export function resolveSnoozeUntil(
  duration: '1h' | '2h' | '4h' | 'tomorrow',
  now = new Date(),
): Date {
  if (duration === 'tomorrow') {
    const { year, month, day } = getBrtParts(now);
    const tomorrow = new Date(
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T09:00:00-03:00`,
    );
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  const hours = duration === '1h' ? 1 : duration === '2h' ? 2 : 4;
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}
