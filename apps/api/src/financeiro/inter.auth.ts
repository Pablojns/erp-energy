import { isAccessTokenExpired, expiryFromExpiresIn } from './conta-azul.auth';

export const INTER_API_BASE = 'https://cdpj.partners.bancointer.com.br';
export const INTER_TOKEN_URL = `${INTER_API_BASE}/oauth/v2/token`;
export const INTER_EXTRATO_PATH = '/banking/v2/extrato';
/** Extrato enriquecido/paginado — preferível para conciliação completa. */
export const INTER_EXTRATO_COMPLETO_PATH = '/banking/v2/extrato/completo';
export const INTER_SALDO_PATH = '/banking/v2/saldo';

/** Escopos alinhados às permissões do app (exceto Pix Automático). */
export const INTER_DEFAULT_SCOPES = [
  'extrato.read',
  'saldo.read',
  'pagamento-boleto.read',
  'pagamento-boleto.write',
  'pagamento-pix.write',
  'cob.read',
  'cob.write',
  'cobv.read',
  'cobv.write',
  'pix.read',
  'pix.write',
  'boleto-cobranca.read',
  'boleto-cobranca.write',
].join(' ');

export const INTER_SESSION_ID = 'default';
export const INTER_TOKEN_SKEW_MS = 120_000;
export const INTER_REFRESH_LOCK_MS = 45_000;
/** Extrato Inter: janela máxima de 90 dias por chamada. */
export const INTER_EXTRATO_MAX_DAYS = 90;

export type InterTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

export { isAccessTokenExpired, expiryFromExpiresIn };

export function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addUtcDays(d: Date, days: number): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days, 12, 0, 0, 0),
  );
}

/** Quebra [inicio, fim] em janelas de no máximo `maxDays` (inclusive). */
export function chunkDateRange(
  dataInicio: Date,
  dataFim: Date,
  maxDays = INTER_EXTRATO_MAX_DAYS,
): Array<{ inicio: Date; fim: Date }> {
  const start = new Date(
    Date.UTC(
      dataInicio.getUTCFullYear(),
      dataInicio.getUTCMonth(),
      dataInicio.getUTCDate(),
      12,
      0,
      0,
      0,
    ),
  );
  const end = new Date(
    Date.UTC(
      dataFim.getUTCFullYear(),
      dataFim.getUTCMonth(),
      dataFim.getUTCDate(),
      12,
      0,
      0,
      0,
    ),
  );
  if (start.getTime() > end.getTime()) return [];
  const chunks: Array<{ inicio: Date; fim: Date }> = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    const chunkEnd = addUtcDays(cursor, maxDays - 1);
    const fim = chunkEnd.getTime() > end.getTime() ? end : chunkEnd;
    chunks.push({ inicio: cursor, fim });
    cursor = addUtcDays(fim, 1);
  }
  return chunks;
}
