import { startOfUtcDay } from './contas-atraso';
import { stripAccents } from '../orders/order-search';

export const BANK_CREDIT_SOURCE = {
  INTER_CSV: 'INTER_CSV',
  INTER_API: 'INTER_API',
} as const;

export type BankCreditSource =
  (typeof BANK_CREDIT_SOURCE)[keyof typeof BANK_CREDIT_SOURCE];

/** Crédito bancário genérico — CSV hoje, API Inter depois. */
export type BankCredit = {
  date: Date;
  amount: number;
  counterparty: string;
  historico: string;
  source: BankCreditSource;
  externalId: string;
};

export const WEG_BANK_PAYER_TERMS = [
  'weg',
  'divisao motores',
  'parque fabril',
] as const;

export function normalizeBankPayerText(raw: string): string {
  return stripAccents(String(raw ?? ''))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isWegBankPayer(
  description: string,
  terms: readonly string[] = WEG_BANK_PAYER_TERMS,
): boolean {
  const n = normalizeBankPayerText(description);
  if (!n) return false;
  return terms.some((term) => n.includes(normalizeBankPayerText(term)));
}

export function parseBrBankAmount(raw: string): number {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/^R\$/i, '');
  if (!s) return 0;
  const negative = s.startsWith('-');
  const compact = s.replace(/^[+-]/, '');
  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');
  let normalized = compact;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot
        ? compact.replace(/\./g, '').replace(',', '.')
        : compact.replace(/,/g, '');
  } else if (lastComma >= 0) {
    normalized = compact.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = compact.replace(/,/g, '');
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return 0;
  return negative ? -Math.abs(n) : n;
}

export function parseBrBankDate(raw: string): Date | null {
  const m = String(raw ?? '')
    .trim()
    .match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += y >= 70 ? 1900 : 2000;
  const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

function findHeaderIndex(lines: string[]): number {
  return lines.findIndex((line) => {
    const n = normalizeBankPayerText(line);
    return (
      n.includes('data lancamento') &&
      n.includes('valor') &&
      (n.includes('descricao') || n.includes('historico'))
    );
  });
}

function splitCsvLine(line: string): string[] {
  return line.split(';').map((c) => c.trim());
}

/**
 * Extrato Inter CSV: metadados no topo, cabeçalho "Data Lançamento;Histórico;Descrição;Valor;Saldo".
 * Só devolve créditos (valor > 0).
 */
export function parseInterCsv(buffer: Uint8Array): BankCredit[] {
  const text = Buffer.from(buffer)
    .toString('utf8')
    .replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  const headerIdx = findHeaderIndex(lines);
  if (headerIdx < 0) {
    throw new Error(
      'Cabeçalho do extrato Inter não encontrado (esperado: Data Lançamento; Histórico; Descrição; Valor; Saldo).',
    );
  }
  const header = splitCsvLine(lines[headerIdx] ?? '');
  const idx = {
    data: header.findIndex((h) => normalizeBankPayerText(h).includes('data')),
    hist: header.findIndex((h) =>
      normalizeBankPayerText(h).includes('historico'),
    ),
    desc: header.findIndex((h) =>
      normalizeBankPayerText(h).includes('descricao'),
    ),
    valor: header.findIndex((h) => normalizeBankPayerText(h) === 'valor'),
  };
  if (idx.data < 0 || idx.valor < 0) {
    throw new Error('Colunas Data Lançamento e Valor são obrigatórias.');
  }

  const out: BankCredit[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    const cols = splitCsvLine(raw);
    const amount = parseBrBankAmount(cols[idx.valor] ?? '');
    if (!(amount > 0)) continue;
    const date = parseBrBankDate(cols[idx.data] ?? '');
    if (!date) continue;
    const counterparty = cols[idx.desc >= 0 ? idx.desc : 2] ?? '';
    const historico = cols[idx.hist >= 0 ? idx.hist : 1] ?? '';
    const ymd = startOfUtcDay(date).toISOString().slice(0, 10);
    out.push({
      date,
      amount,
      counterparty,
      historico,
      source: BANK_CREDIT_SOURCE.INTER_CSV,
      externalId: `${ymd}|${amount.toFixed(2)}|${counterparty}|${i}`,
    });
  }
  return out;
}
