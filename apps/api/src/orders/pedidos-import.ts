import { OrderStatus, Prisma } from '@erp/database';
import * as XLSX from 'xlsx';

export type PedidosImportSummary = {
  importados: number;
  atualizados: number;
  ignorados: number;
  erros: string[];
  resetados?: number;
};

/** Mapeia Status ME / Status CA da planilha WEG para OrderStatus do ERP. */
export function resolveOrderStatusFromPlanilha(
  statusMe: string | null | undefined,
  statusCa: string | null | undefined,
): OrderStatus {
  const me = (statusMe ?? '').trim();
  const ca = (statusCa ?? '').trim();

  if (me === 'Totalmente recebido') {
    return ca === 'Faturado' ? OrderStatus.FINALIZADO : OrderStatus.AGUARDANDO_NF;
  }
  if (me === 'Parcialmente recebido') return OrderStatus.PARCIAL;
  if (me === 'Sem recebimento') return OrderStatus.NOVO;
  return OrderStatus.NOVO;
}

export type PedidoPlanilhaRow = {
  numero_ped: number;
  data_pedido: string;
  data_entrega: string;
  seq: number;
  sku: string;
  nome_produto: string;
  status_item: string | null;
  quantidade: number;
  cnpj_entrega: string | null;
  ponto_descarga: string | null;
  recebedor: string | null;
  status_me: string | null;
  status_ca: string | null;
  nota_fiscal: string | null;
  valor_total: string | number | null;
  observacao_me: string | null;
  observacao_logistica: string | null;
};

function normalizeText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** Traço/vazio na coluna "Nota Fiscal" da planilha WEG → null no banco. */
const INVOICE_PLACEHOLDER = /^[\s\-–—−―‐‑‒]*$/;

export function normalizePlanilhaInvoiceNumber(
  v: string | null | undefined,
): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (INVOICE_PLACEHOLDER.test(s)) return null;
  return s;
}

export function parseBrlMoneyToDecimalString(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v.toFixed(2);
  }

  const s = normalizeText(v);
  if (!s) return null;

  const compact = s.replace(/\s/g, '').replace(/^R\$/i, '');
  // "1.666,00" (BRL) ou "1666.00" (decimal com ponto)
  const hasComma = compact.includes(',');
  const cleaned = hasComma
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

export function parseDateToIso(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }

  // Excel serial date
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 90000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d && d.y && d.m && d.d) {
      const yyyy = String(d.y).padStart(4, '0');
      const mm = String(d.m).padStart(2, '0');
      const dd = String(d.d).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const s = normalizeText(v);
  if (!s) return null;

  // DD/MM/YYYY
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  // YYYY-MM-DD
  const iso = /^\d{4}-\d{2}-\d{2}$/.exec(s);
  if (iso) return s;

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/** Converte YYYY-MM-DD em Date UTC (meio-dia) para evitar troca de dia por fuso. */
export function isoDateStringToUtcDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) {
    throw new Error(`Data ISO inválida: ${iso}`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
}

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

export function pickFirstLineOfOrderGroup(
  rows: PedidoPlanilhaRow[],
): PedidoPlanilhaRow {
  return [...rows].sort((a, b) => a.seq - b.seq)[0]!;
}

/** Normaliza o status da linha da planilha WEG (Recebido, Em falta, etc.). */
export function normalizePlanilhaItemStatus(
  statusItem: string | null | undefined,
): string | null {
  const s = (statusItem ?? '').trim();
  return s ? s : null;
}

/** Item da planilha WEG já recebido (OK / Recebido) — não deve gerar nova separação/saída. */
export function isPlanilhaItemReceived(
  statusItem: string | null | undefined,
): boolean {
  const normalized = (statusItem ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return normalized === 'ok' || normalized.includes('recebido');
}

export function readPedidosSheet(buffer: Uint8Array): {
  rows: PedidoPlanilhaRow[];
  ignored: number;
} {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet =
    wb.Sheets['PEDIDOS'] ??
    wb.Sheets['Pedidos'] ??
    wb.Sheets['Logistica'] ??
    wb.Sheets['LOGISTICA'] ??
    wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], ignored: 0 };

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  if (matrix.length < 2) return { rows: [], ignored: 0 };

  const headers = buildHeaderIndexMap(matrix[0] ?? []);
  const dataRows = matrix.slice(1);

  const out: PedidoPlanilhaRow[] = [];
  let ignored = 0;
  for (const r of dataRows) {
    const row = Array.isArray(r) ? r : [];
    const numero = Number(
      cellByHeader(row, headers, 'Numero Pedido', 'Número Pedido') ?? row[0],
    );
    const seq = Number(cellByHeader(row, headers, 'Seq.', 'Seq') ?? row[3]);
    const sku = normalizeText(
      cellByHeader(row, headers, 'SKU') ?? row[4],
    );
    const nomeProduto =
      normalizeText(cellByHeader(row, headers, 'Nome Produto') ?? row[5]) ?? '';
    const qtdRaw = cellByHeader(row, headers, 'Quantidade') ?? row[7];
    let qtd: number;
    if (typeof qtdRaw === 'number') {
      qtd = qtdRaw;
    } else {
      const qtdStr = String(qtdRaw ?? '').replace(/\./g, '').replace(',', '.');
      qtd = Number(qtdStr);
    }

    const obsMe = normalizeText(
      cellByHeader(row, headers, 'Observacao ME', 'Observação ME') ?? row[15],
    );
    const obsLog = normalizeText(
      cellByHeader(row, headers, 'Observacao Logistica', 'Observação Logística') ??
        row[16],
    );
    if (
      (obsMe ?? '').toUpperCase().includes('ERRO LEITURA ITENS') ||
      (obsLog ?? '').toUpperCase().includes('ERRO LEITURA ITENS')
    ) {
      ignored += 1;
      continue;
    }

    const dataPedido = parseDateToIso(
      cellByHeader(row, headers, 'Data Pedido') ?? row[1],
    );
    const dataEntrega = parseDateToIso(
      cellByHeader(row, headers, 'DATA ENTREGA', 'Data Entrega') ?? row[2],
    );

    if (!Number.isFinite(numero) || numero <= 0) {
      ignored += 1;
      continue;
    }
    if (!dataPedido || !dataEntrega) {
      ignored += 1;
      continue;
    }
    if (!Number.isFinite(seq) || seq <= 0) {
      ignored += 1;
      continue;
    }
    if (!sku) {
      ignored += 1;
      continue;
    }
    if (!Number.isFinite(qtd) || qtd <= 0) {
      ignored += 1;
      continue;
    }

    out.push({
      numero_ped: numero,
      data_pedido: dataPedido,
      data_entrega: dataEntrega,
      seq,
      sku,
      nome_produto: nomeProduto || sku,
      status_item: normalizeText(
        cellByHeader(row, headers, 'Status Item') ?? row[6],
      ),
      quantidade: qtd,
      cnpj_entrega: normalizeText(
        cellByHeader(row, headers, 'CNPJ Entrega') ?? row[8],
      ),
      ponto_descarga: normalizeText(
        cellByHeader(row, headers, 'Ponto Descarga') ?? row[9],
      ),
      recebedor: normalizeText(
        cellByHeader(row, headers, 'Recebedor') ?? row[10],
      ),
      status_me: normalizeText(
        cellByHeader(row, headers, 'Status ME') ?? row[11],
      ),
      status_ca: normalizeText(
        cellByHeader(row, headers, 'Status CA') ?? row[12],
      ),
      nota_fiscal: normalizePlanilhaInvoiceNumber(
        normalizeText(
          cellByHeader(row, headers, 'Nota Fiscal') ?? row[13],
        ),
      ),
      valor_total: (cellByHeader(row, headers, 'Valor Total') ?? row[14]) as
        | string
        | number
        | null,
      observacao_me: obsMe,
      observacao_logistica: obsLog,
    });
  }
  return { rows: out, ignored };
}

export function groupByNumeroPed(rows: PedidoPlanilhaRow[]): Map<number, PedidoPlanilhaRow[]> {
  const map = new Map<number, PedidoPlanilhaRow[]>();
  for (const r of rows) {
    const arr = map.get(r.numero_ped);
    if (arr) arr.push(r);
    else map.set(r.numero_ped, [r]);
  }
  return map;
}

export function decimalFromStringOrZero(v: string | null): Prisma.Decimal {
  if (!v) return new Prisma.Decimal('0.00');
  return new Prisma.Decimal(v);
}
