import {
  BANK_CREDIT_SOURCE,
  type BankCredit,
  parseBrBankDate,
} from './bank-credits';
import { startOfUtcDay } from './contas-atraso';

export type InterApiTransaction = {
  dataEntrada?: string;
  dataTransacao?: string;
  tipoTransacao?: string;
  tipoOperacao?: string;
  valor?: string | number;
  titulo?: string;
  descricao?: string;
  idTransacao?: string;
  detalhes?: {
    nomePagador?: string;
    nomeRecebedor?: string;
  };
};

export type InterExtratoResponse = {
  transacoes?: InterApiTransaction[];
};

export type InterSaldoResponse = {
  disponivel?: number;
  limite?: number;
  bloqueadoCheque?: number;
  bloqueadoJudicialmente?: number;
  bloqueadoAdministrativo?: number;
};

function asText(v: unknown): string {
  return String(v ?? '').trim();
}

function parseValor(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = asText(raw).replace(/\s/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Mapeia transações do `/banking/v2/extrato` para `BankCredit` (só créditos).
 * Fonte: INTER_API — o motor de reconciliação não muda.
 */
export function mapInterExtratoToBankCredits(
  payload: InterExtratoResponse | InterApiTransaction[] | null | undefined,
): BankCredit[] {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.transacoes)
      ? payload!.transacoes!
      : [];
  const out: BankCredit[] = [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i] ?? {};
    const op = asText(t.tipoOperacao).toUpperCase();
    // C = crédito, D = débito
    if (op && op !== 'C' && op !== 'CREDITO' && op !== 'CREDIT') continue;
    const amount = Math.abs(parseValor(t.valor));
    if (!(amount > 0)) continue;
    if (op === 'D' || op === 'DEBITO' || op === 'DEBIT') continue;
    // Sem tipoOperacao: só aceita valor positivo já absoluto acima
    const dateRaw = asText(t.dataEntrada) || asText(t.dataTransacao);
    const date =
      parseBrBankDate(dateRaw) ||
      (dateRaw.match(/^\d{4}-\d{2}-\d{2}/)
        ? new Date(`${dateRaw.slice(0, 10)}T12:00:00.000Z`)
        : null);
    if (!date) continue;
    const titulo = asText(t.titulo);
    const descricao =
      asText(t.descricao) ||
      asText(t.detalhes?.nomePagador) ||
      asText(t.detalhes?.nomeRecebedor);
    // CSV Inter: Descrição = pagador; Histórico = tipo. Alinha API ao mesmo.
    const counterparty = descricao || titulo || '—';
    const historico = [titulo, asText(t.tipoTransacao)].filter(Boolean).join(' · ');
    const ymd = startOfUtcDay(date).toISOString().slice(0, 10);
    const externalId =
      asText(t.idTransacao) ||
      `inter|${ymd}|${amount.toFixed(2)}|${counterparty}|${asText(t.tipoTransacao)}|${i}`;
    out.push({
      date,
      amount,
      counterparty,
      historico: historico || 'Crédito Inter',
      source: BANK_CREDIT_SOURCE.INTER_API,
      externalId,
    });
  }
  return out;
}
