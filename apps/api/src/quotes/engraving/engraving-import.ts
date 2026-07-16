import * as XLSX from 'xlsx';

export type EngravingImportRow = {
  name: string;
  calculationType: string;
  multiplyColors: boolean;
  supplierCompany: string | null;
  qtyFrom: number;
  qtyTo: number;
  cost: number;
  costType: string;
  fixedFee: number;
  applicationCost: number;
};

export type EngravingImportSummary = {
  criadas: number;
  atualizadas: number;
  faixas: number;
  ignoradas: number;
  erros: string[];
};

function normalizeHeaderKey(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
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

function normalizeText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function parseBoolean(v: unknown): boolean {
  const s = normalizeText(v)?.toLowerCase();
  if (!s) return false;
  return s === 'sim' || s === 's' || s === 'true' || s === '1' || s === 'x';
}

function parseIntSafe(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  const s = normalizeText(v);
  if (!s) return fallback;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function parseDecimal(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v);
  const s = normalizeText(v);
  if (!s) return 0;
  const compact = s.replace(/\s/g, '').replace(/^R\$/i, '');
  const hasComma = compact.includes(',');
  const cleaned = hasComma
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function normalizeCostType(v: unknown): string {
  const s = normalizeText(v)?.toLowerCase() ?? '';
  if (s.includes('interval')) return 'Intervalo';
  return 'Unidade';
}

export function readEngravingSheet(buffer: Uint8Array): {
  rows: EngravingImportRow[];
  ignored: number;
} {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet =
    wb.Sheets['Gravações'] ??
    wb.Sheets['Gravacoes'] ??
    wb.Sheets['GRAVACOES'] ??
    wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], ignored: 0 };

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  });

  let headerIdx = -1;
  let headers = new Map<string, number>();
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) continue;
    const candidate = buildHeaderIndexMap(row);
    if (candidate.has('nome')) {
      headerIdx = i;
      headers = candidate;
      break;
    }
  }

  if (headerIdx < 0) return { rows: [], ignored: 0 };

  const out: EngravingImportRow[] = [];
  let ignored = 0;

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) {
      ignored += 1;
      continue;
    }

    const name = normalizeText(cellByHeader(row, headers, 'Nome', 'Técnica', 'Tecnica'));
    if (!name) {
      ignored += 1;
      continue;
    }

    out.push({
      name,
      calculationType:
        normalizeText(
          cellByHeader(
            row,
            headers,
            'Tipo de Cálculo',
            'Tipo de Calculo',
            'Tipo Cálculo',
            'Calculation Type',
          ),
        ) ?? 'Unidade/Intervalo',
      multiplyColors: parseBoolean(
        cellByHeader(row, headers, 'Multiplicar Cores', 'Multiply Colors'),
      ),
      supplierCompany: normalizeText(
        cellByHeader(
          row,
          headers,
          'Empresa',
          'Empresa Fornecedora',
          'Fornecedor',
          'Supplier',
        ),
      ),
      qtyFrom: parseIntSafe(
        cellByHeader(row, headers, 'De', 'Qtd De', 'Qty From', 'Quantidade De'),
        0,
      ),
      qtyTo: parseIntSafe(
        cellByHeader(row, headers, 'Até', 'Ate', 'Qtd Até', 'Qty To', 'Quantidade Até'),
        0,
      ),
      cost: parseDecimal(cellByHeader(row, headers, 'Custo', 'Cost', 'Preço', 'Preco')),
      costType: normalizeCostType(
        cellByHeader(row, headers, 'Tipo Custo', 'Tipo', 'Cost Type'),
      ),
      fixedFee: parseDecimal(
        cellByHeader(row, headers, 'Taxa Fixa', 'Fixed Fee', 'Taxa'),
      ),
      applicationCost: parseDecimal(
        cellByHeader(
          row,
          headers,
          'Custo Aplicação',
          'Custo Aplicacao',
          'Application Cost',
        ),
      ),
    });
  }

  return { rows: out, ignored };
}

export function groupEngravingRowsByName(
  rows: EngravingImportRow[],
): Map<string, EngravingImportRow[]> {
  const map = new Map<string, EngravingImportRow[]>();
  for (const row of rows) {
    const key = row.name.trim();
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}
