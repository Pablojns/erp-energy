import { startOfUtcDay } from './contas-atraso';
import { isWegBankPayer, type BankCredit } from './bank-credits';

export const CONCILIACAO_ORIGEM_EXTRATO_INTER =
  'Conciliação automática — Extrato Inter';

export const BANK_MATCH_DATE_TOLERANCE_DAYS = 2;

export type ReconcileOpenNote = {
  invoiceDigits: string;
  pedido: string;
  valor: number;
  pagoEm: Date | null;
  docCompensacao: string | null;
};

export type ReconcileNoteHit = {
  invoiceDigits: string;
  pedido: string;
  valor: number;
};

export type ReconcileCreditHit = {
  date: string;
  amount: number;
  counterparty: string;
  historico: string;
  source: BankCredit['source'];
  externalId: string;
};

export type ReconcileAutoMatch = {
  credit: ReconcileCreditHit;
  notes: ReconcileNoteHit[];
  docCompensacao: string | null;
  groupAmount: number;
};

export type ReconcileAlert = {
  credit: ReconcileCreditHit;
  notes: ReconcileNoteHit[];
  reason: 'valor_bate_nome_desconhecido';
};

export type ReconcileUnmatchedWeg = {
  credit: ReconcileCreditHit;
};

export type BankReconcileResult = {
  wegIdentificados: number;
  autoMatches: ReconcileAutoMatch[];
  alerts: ReconcileAlert[];
  wegSemNota: ReconcileUnmatchedWeg[];
  otherCredits: number;
};

export function moneyCents(n: number): number {
  return Math.round((Number(n) || 0) * 100);
}

export function sameMoney(a: number, b: number): boolean {
  return moneyCents(a) === moneyCents(b);
}

function daysBetween(a: Date, b: Date): number {
  const ms =
    startOfUtcDay(a).getTime() - startOfUtcDay(b).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function withinDateWindow(
  bankDate: Date,
  pagoEm: Date | null,
  toleranceDays: number,
): boolean {
  if (!pagoEm) return true;
  return Math.abs(daysBetween(bankDate, pagoEm)) <= toleranceDays;
}

function toCreditHit(c: BankCredit): ReconcileCreditHit {
  return {
    date: c.date.toISOString(),
    amount: c.amount,
    counterparty: c.counterparty,
    historico: c.historico,
    source: c.source,
    externalId: c.externalId,
  };
}

function toNoteHit(n: ReconcileOpenNote): ReconcileNoteHit {
  return {
    invoiceDigits: n.invoiceDigits,
    pedido: n.pedido,
    valor: n.valor,
  };
}

type NoteGroup = {
  key: string;
  notes: ReconcileOpenNote[];
  amount: number;
  pagoEm: Date | null;
  docCompensacao: string | null;
};

export function groupDeclaradoNotes(
  notes: ReconcileOpenNote[],
): NoteGroup[] {
  const buckets = new Map<string, ReconcileOpenNote[]>();
  for (const n of notes) {
    const doc = String(n.docCompensacao ?? '').trim();
    const key = doc ? `doc:${doc}` : `nf:${n.invoiceDigits}`;
    const list = buckets.get(key);
    if (list) list.push(n);
    else buckets.set(key, [n]);
  }
  const groups: NoteGroup[] = [];
  for (const [key, list] of buckets) {
    const amount = list.reduce((s, n) => s + (Number(n.valor) || 0), 0);
    const dated = list
      .map((n) => n.pagoEm)
      .filter((d): d is Date => Boolean(d));
    const pagoEm =
      dated.length === 0
        ? null
        : new Date(Math.min(...dated.map((d) => d.getTime())));
    groups.push({
      key,
      notes: list,
      amount,
      pagoEm,
      docCompensacao: key.startsWith('doc:') ? key.slice(4) : null,
    });
  }
  return groups;
}

function pickGroupForCredit(
  groups: NoteGroup[],
  used: Set<string>,
  credit: BankCredit,
  toleranceDays: number,
): NoteGroup | null {
  const candidates = groups.filter(
    (g) =>
      !used.has(g.key) &&
      sameMoney(g.amount, credit.amount) &&
      withinDateWindow(credit.date, g.pagoEm, toleranceDays),
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  candidates.sort((a, b) => {
    const da = a.pagoEm ? Math.abs(daysBetween(credit.date, a.pagoEm)) : 99;
    const db = b.pagoEm ? Math.abs(daysBetween(credit.date, b.pagoEm)) : 99;
    return da - db;
  });
  const best = candidates[0];
  const second = candidates[1];
  const bestDiff = best.pagoEm
    ? Math.abs(daysBetween(credit.date, best.pagoEm))
    : 99;
  const secondDiff = second.pagoEm
    ? Math.abs(daysBetween(credit.date, second.pagoEm))
    : 99;
  if (bestDiff < secondDiff) return best;
  return null;
}

/**
 * Motor de conciliação independente da fonte (CSV ou API).
 * Camada 1: nome WEG conhecido → auto-match valor+data (±2d), agrupando por Doc.compensação.
 * Camada 2: nome desconhecido + valor exato → alerta, nunca confirma.
 */
export function reconcileBankCredits(
  credits: BankCredit[],
  openNotes: ReconcileOpenNote[],
  opts?: { dateToleranceDays?: number },
): BankReconcileResult {
  const tolerance =
    opts?.dateToleranceDays ?? BANK_MATCH_DATE_TOLERANCE_DAYS;
  const groups = groupDeclaradoNotes(
    openNotes.filter((n) => (Number(n.valor) || 0) > 0),
  );
  const used = new Set<string>();
  const autoMatches: ReconcileAutoMatch[] = [];
  const wegSemNota: ReconcileUnmatchedWeg[] = [];
  const alerts: ReconcileAlert[] = [];

  const wegCredits = credits.filter((c) => isWegBankPayer(c.counterparty));
  const otherCredits = credits.filter((c) => !isWegBankPayer(c.counterparty));

  for (const credit of wegCredits) {
    const group = pickGroupForCredit(groups, used, credit, tolerance);
    if (!group) {
      wegSemNota.push({ credit: toCreditHit(credit) });
      continue;
    }
    used.add(group.key);
    autoMatches.push({
      credit: toCreditHit(credit),
      notes: group.notes.map(toNoteHit),
      docCompensacao: group.docCompensacao,
      groupAmount: group.amount,
    });
  }

  for (const credit of otherCredits) {
    const group = pickGroupForCredit(groups, used, credit, tolerance);
    if (!group) continue;
    used.add(group.key);
    alerts.push({
      credit: toCreditHit(credit),
      notes: group.notes.map(toNoteHit),
      reason: 'valor_bate_nome_desconhecido',
    });
  }

  return {
    wegIdentificados: wegCredits.length,
    autoMatches,
    alerts,
    wegSemNota,
    otherCredits: otherCredits.length,
  };
}
