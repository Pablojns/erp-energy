import { Prisma } from '@erp/database';
import * as XLSX from 'xlsx';

export type PedidosImportSummary = {
  importados: number;
  atualizados: number;
  ignorados: number;
  erros: string[];
};

export type PedidoPlanilhaRow = {
  numero_ped: number;
  data_pedido: string; // YYYY-MM-DD
  data_entrega: string; // YYYY-MM-DD
  seq: number;
  produto: string;
  quantidade: number;
  cnpj_entrega: string | null;
  ponto_descarga: string | null;
  recebedor: string | null;
  status_me: string | null;
  status_ca: string | null;
  nota_fiscal: string | null;
  valor_total: string | number | null;
  observacao: string | null;
};

function normalizeText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export function parseBrlMoneyToDecimalString(v: unknown): string | null {
  const s = normalizeText(v);
  if (!s) return null;
  // "R$ 1.666,00" -> "1666.00"
  const cleaned = s
    .replace(/\s/g, '')
    .replace(/^R\$/i, '')
    .replace(/\./g, '')
    .replace(',', '.');
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

export function splitSkuAndName(produto: string): { sku: string; nome: string } {
  const raw = produto.trim();
  const idx = raw.indexOf(' - ');
  if (idx === -1) {
    return { sku: raw, nome: raw };
  }
  const sku = raw.slice(0, idx).trim();
  const nome = raw.slice(idx + 3).trim();
  return { sku, nome };
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

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    header: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'],
    range: 1, // skip header row
    defval: null,
    blankrows: false,
  });

  const out: PedidoPlanilhaRow[] = [];
  let ignored = 0;
  for (const r of rows) {
    const numero = Number(r.A);
    const seq = Number(r.D);
    const produto = normalizeText(r.E);
    const qtdRaw = r.F;
    let qtd: number;
    if (typeof qtdRaw === 'number') {
      qtd = qtdRaw;
    } else {
      const qtdStr = String(qtdRaw ?? '').replace(/\./g, '').replace(',', '.');
      qtd = Number(qtdStr);
    }

    const obs = normalizeText(r.N);
    if ((obs ?? '').toUpperCase().includes('ERRO LEITURA ITENS')) {
      ignored += 1;
      continue;
    }

    const dataPedido = parseDateToIso(r.B);
    const dataEntrega = parseDateToIso(r.C);

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
    if (!produto) {
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
      produto,
      quantidade: qtd,
      cnpj_entrega: normalizeText(r.G),
      ponto_descarga: normalizeText(r.H),
      recebedor: normalizeText(r.I),
      status_me: normalizeText(r.J),
      status_ca: normalizeText(r.K),
      nota_fiscal: normalizeText(r.L),
      valor_total: r.M as string | number | null,
      observacao: obs,
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

