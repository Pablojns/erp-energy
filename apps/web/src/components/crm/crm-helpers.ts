import type {
  CrmCardDto,
  CrmCardOrigin,
  CrmChannelDto,
  CrmTouchpointDto,
} from '@/src/services/api/crm-api';

export type CrmDashboardPeriod = '7d' | '30d' | '90d' | 'all';

export const CRM_DASHBOARD_PERIODS: Array<{
  id: CrmDashboardPeriod;
  label: string;
}> = [
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
  { id: 'all', label: 'Tudo' },
];

export const CRM_ENTRY_PERIOD_OPTIONS: Array<{
  id: CrmDashboardPeriod;
  label: string;
}> = CRM_DASHBOARD_PERIODS;

const FOLLOW_UP_DAYS = 3;
const NOTE_LINE_RE = /^\[(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\]\s*(.+)$/;

export type CrmActivityItem = {
  id: string;
  type: string;
  channel: string | null;
  note: string | null;
  at: string;
  kind: 'touchpoint' | 'note' | 'created';
};

export function isCrmClosedStatus(card: CrmCardDto): boolean {
  const name = card.statusMeta?.name;
  return (
    name === 'Fechado' ||
    name === 'Perdido' ||
    card.funil?.name === 'Orçamento Reprovado' ||
    card.funil?.name === 'Perdidos'
  );
}

export function getCrmLastContactAt(card: CrmCardDto): string {
  return card.lastTouchpointAt ?? card.updatedAt ?? card.createdAt;
}

export function getCrmCreationDate(card: CrmCardDto): string {
  return card.createdAt;
}

export function formatCrmDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR');
}

export function isCrmFollowUpOverdue(card: CrmCardDto): boolean {
  if (isCrmClosedStatus(card)) return false;
  const last = new Date(getCrmLastContactAt(card)).getTime();
  const days = (Date.now() - last) / (1000 * 60 * 60 * 24);
  return days > FOLLOW_UP_DAYS;
}

export function countCrmFollowUpOverdue(cards: CrmCardDto[]): number {
  return cards.filter(isCrmFollowUpOverdue).length;
}

export function channelNameById(
  channels: CrmChannelDto[],
  channelId: string | null | undefined,
): string | null {
  if (!channelId) return null;
  return channels.find((c) => c.id === channelId)?.name ?? null;
}

export function buildCrmActivityTimeline(
  card: Pick<CrmCardDto, 'createdAt' | 'notes' | 'touchpoints'>,
  channels: CrmChannelDto[],
): CrmActivityItem[] {
  const items: CrmActivityItem[] = [
    {
      id: 'created',
      type: 'Lead criado',
      channel: null,
      note: null,
      at: card.createdAt,
      kind: 'created',
    },
  ];

  for (const tp of card.touchpoints ?? []) {
    if (!tp.done) continue;
    items.push(touchpointToActivity(tp, channels));
  }

  for (const noteItem of parseQuickNotes(card.notes)) {
    items.push(noteItem);
  }

  return items.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}

function touchpointToActivity(
  tp: CrmTouchpointDto,
  channels: CrmChannelDto[],
): CrmActivityItem {
  return {
    id: `tp-${tp.number}`,
    type: `Touchpoint TP${tp.number}`,
    channel: channelNameById(channels, tp.channel),
    note: null,
    at: tp.date ?? tp.createdAt,
    kind: 'touchpoint',
  };
}

function parseQuickNotes(notes: string | null | undefined): CrmActivityItem[] {
  if (!notes?.trim()) return [];
  const lines = notes.split('\n').map((line) => line.trim()).filter(Boolean);
  const parsed: CrmActivityItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = line.match(NOTE_LINE_RE);
    if (match) {
      parsed.push({
        id: `note-${match[1]}-${i}`,
        type: 'Nota rápida',
        channel: null,
        note: match[2] ?? null,
        at: match[1]!,
        kind: 'note',
      });
    }
  }

  return parsed;
}

export function appendQuickNote(
  existingNotes: string | null | undefined,
  text: string,
): string {
  const trimmed = text.trim();
  if (!trimmed) return existingNotes?.trim() ?? '';
  const stamp = new Date().toISOString();
  const line = `[${stamp}] ${trimmed}`;
  const base = existingNotes?.trim();
  return base ? `${base}\n${line}` : line;
}

export function cardMatchesEntryPeriod(
  card: CrmCardDto,
  period: CrmDashboardPeriod,
): boolean {
  if (period === 'all') return true;
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(card.createdAt).getTime() >= cutoff;
}

export function cardMatchesEntryDateRange(
  card: CrmCardDto,
  startDate: string,
  endDate: string,
): boolean {
  const start = startDate.trim();
  const end = endDate.trim();
  if (!start && !end) return true;

  const entry = new Date(card.createdAt);
  const entryDay = new Date(
    entry.getFullYear(),
    entry.getMonth(),
    entry.getDate(),
  ).getTime();

  if (start) {
    const [y, m, d] = start.split('-').map(Number);
    if (
      Number.isFinite(y) &&
      Number.isFinite(m) &&
      Number.isFinite(d) &&
      entryDay < new Date(y!, m! - 1, d!).getTime()
    ) {
      return false;
    }
  }
  if (end) {
    const [y, m, d] = end.split('-').map(Number);
    if (
      Number.isFinite(y) &&
      Number.isFinite(m) &&
      Number.isFinite(d) &&
      entryDay > new Date(y!, m! - 1, d!).getTime()
    ) {
      return false;
    }
  }
  return true;
}

export function toCrmDateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayCrmDateInputValue(): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function crmDateInputToIso(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T12:00:00.000Z`;
  }
  return new Date(trimmed).toISOString();
}

export function formatCrmDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type CrmRelatoriosPeriodPreset = '7d' | '30d' | '90d' | '12m' | 'custom';

export const CRM_RELATORIOS_PERIOD_PRESETS: Array<{
  id: CrmRelatoriosPeriodPreset;
  label: string;
}> = [
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
  { id: '12m', label: '12 meses' },
  { id: 'custom', label: 'Personalizado' },
];

export function resolveRelatoriosPeriod(
  preset: CrmRelatoriosPeriodPreset,
  customStart?: string,
  customEnd?: string,
): { startDate: string; endDate: string } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  if (preset === 'custom') {
    if (!customStart || !customEnd) {
      const fallbackStart = new Date(end);
      fallbackStart.setDate(end.getDate() - 30);
      fallbackStart.setHours(0, 0, 0, 0);
      return {
        startDate: fallbackStart.toISOString(),
        endDate: end.toISOString(),
      };
    }
    const start = new Date(`${customStart}T00:00:00`);
    const customEndDate = new Date(`${customEnd}T23:59:59`);
    return {
      startDate: start.toISOString(),
      endDate: customEndDate.toISOString(),
    };
  }

  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  if (preset === '7d') start.setDate(end.getDate() - 7);
  else if (preset === '30d') start.setDate(end.getDate() - 30);
  else if (preset === '90d') start.setDate(end.getDate() - 90);
  else if (preset === '12m') start.setFullYear(end.getFullYear() - 1);

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

export function crmUserInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function crmMetaProgressColor(percent: number) {
  if (percent >= 80) return 'bg-emerald-500';
  if (percent >= 50) return 'bg-amber-400';
  return 'bg-rose-500';
}

export function parseCrmImportCsv(text: string): Array<{
  nome: string;
  telefone: string;
  email: string;
  origem: string;
  valor: string;
  observacoes: string;
  error?: string;
}> {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) return [];

  const splitCsvLine = (line: string) => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = splitCsvLine(lines[0]!).map((h) =>
    h.toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''),
  );

  const idx = (names: string[]) =>
    headers.findIndex((h) => names.some((n) => h.includes(n)));

  const nameIdx = idx(['nome', 'name']);
  const phoneIdx = idx(['telefone', 'phone']);
  const emailIdx = idx(['email', 'e-mail']);
  const originIdx = idx(['origem', 'origin']);
  const valueIdx = idx(['valor', 'value']);
  const notesIdx = idx(['observ', 'notes']);

  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    return {
      nome: cols[nameIdx] ?? '',
      telefone: cols[phoneIdx] ?? '',
      email: cols[emailIdx] ?? '',
      origem: cols[originIdx] ?? '',
      valor: cols[valueIdx] ?? '',
      observacoes: cols[notesIdx] ?? '',
    };
  });
}

export function normalizeCrmImportOrigin(raw: string): CrmCardOrigin | null {
  const normalized = raw
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (normalized.includes('ANUN')) return 'ANUNCIO';
  if (normalized.includes('INDIC')) return 'INDICACAO';
  if (normalized.includes('FRIO')) return 'FRIO';
  if (normalized === 'ANUNCIO' || normalized === 'INDICACAO' || normalized === 'FRIO') {
    return normalized as CrmCardOrigin;
  }
  return null;
}
