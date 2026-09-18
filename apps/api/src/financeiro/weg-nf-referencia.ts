import * as XLSX from 'xlsx';
import { invoiceNumberDigits } from '../orders/order-search';

export const WEG_NF_ANO_CORTE = 2026;

export type WegPlanilhaPagamento = {
  referencia: string;
  invoiceDigits: string;
  valor: number;
  pagoEm: Date | null;
  docCompensacao: string | null;
  documentoNumero: string | null;
  dataDocumento: Date | null;
};

function normalizeHeaderKey(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[.]/g, '')
    .replace(/\s+/g, ' ');
}

function buildHeaderIndexMap(headerRow: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((cell, idx) => {
    const key = normalizeHeaderKey(cell);
    if (key) map.set(key, idx);
  });
  return map;
}

function cellByHeader(
  row: unknown[],
  headers: Map<string, number>,
  ...aliases: string[]
): unknown {
  for (const alias of aliases) {
    const idx = headers.get(normalizeHeaderKey(alias));
    if (idx !== undefined) return row[idx] ?? null;
  }
  return null;
}

function asText(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/**
 * Referência SAP WEG `000001081-1` → NF `1081` (tira zeros à esquerda e o sufixo -1).
 */
export function extractWegNfFromReferencia(
  raw: string | null | undefined,
): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/^0*(\d+)(?:-\d+)?$/);
  if (m?.[1]) return m[1];
  const digits = invoiceNumberDigits(s);
  return digits || null;
}

export function parseWegPlanilhaAmount(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.abs(raw);
  const s = asText(raw);
  if (!s) return 0;
  const compact = s.replace(/\s/g, '').replace(/^R\$/i, '');
  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');
  let normalized = compact;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot
        ? compact.replace(/\./g, '').replace(',', '.')
        : compact.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const frac = compact.length - lastComma - 1;
    normalized =
      frac === 3 ? compact.replace(/,/g, '') : compact.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function utcNoon(y: number, m: number, d: number): Date | null {
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

/** Excel serial, Date, ISO, ou M/D/YY (formato das planilhas SAP/Excel US). */
export function parseWegPlanilhaDate(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return utcNoon(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (!parsed) return null;
    return utcNoon(parsed.y, parsed.m, parsed.d);
  }
  const s = asText(raw);
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return utcNoon(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/.exec(s);
  if (!dmy) return null;
  let a = Number(dmy[1]);
  let b = Number(dmy[2]);
  let y = Number(dmy[3]);
  if (y < 100) y += y >= 70 ? 1900 : 2000;
  if (a > 12 && b <= 12) return utcNoon(y, b, a);
  if (b > 12 && a <= 12) return utcNoon(y, a, b);
  return utcNoon(y, a, b);
}

function firstSheetRows(buffer: Uint8Array): unknown[][] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: true });
  const name = wb.SheetNames[0];
  if (!name) return [];
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];
}

export function parseWegPagamentosPlanilha(
  buffer: Uint8Array,
): WegPlanilhaPagamento[] {
  const rows = firstSheetRows(buffer);
  if (rows.length < 2) return [];
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const keys = buildHeaderIndexMap(rows[i] ?? []);
    if (keys.has('referencia') || keys.has('referência')) {
      headerIdx = i;
      break;
    }
  }
  const headers = buildHeaderIndexMap(rows[headerIdx] ?? []);
  const out: WegPlanilhaPagamento[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const referencia = asText(
      cellByHeader(row, headers, 'Referência', 'Referencia'),
    );
    const invoiceDigits = extractWegNfFromReferencia(referencia);
    if (!referencia || !invoiceDigits) continue;
    const valor = parseWegPlanilhaAmount(
      cellByHeader(row, headers, 'Montante em moeda interna', 'Montante'),
    );
    const pagoEm =
      parseWegPlanilhaDate(
        cellByHeader(row, headers, 'Data de pagamento', 'Data pagamento'),
      ) ??
      parseWegPlanilhaDate(
        cellByHeader(
          row,
          headers,
          'Data de compensação',
          'Data de compensacao',
          'Data compensação',
        ),
      ) ??
      parseWegPlanilhaDate(
        cellByHeader(
          row,
          headers,
          'Vencimento líquido',
          'Vencimento liquido',
        ),
      );
    out.push({
      referencia,
      invoiceDigits,
      valor,
      pagoEm,
      docCompensacao: asText(
        cellByHeader(
          row,
          headers,
          'Doc.compensação',
          'Doc compensação',
          'Doc.compensacao',
        ),
      ),
      documentoNumero: asText(
        cellByHeader(row, headers, 'Nº documento', 'N documento', 'No documento'),
      ),
      dataDocumento: parseWegPlanilhaDate(
        cellByHeader(row, headers, 'Data do documento', 'Data documento'),
      ),
    });
  }
  return out;
}
