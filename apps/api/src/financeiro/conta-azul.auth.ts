import { randomBytes } from 'crypto';

/** Hosted UI Cognito (passo 1 da doc). */
export const CONTA_AZUL_AUTH_LOGIN =
  'https://auth.contaazul.com/login';

/** Token endpoint documentado na troca do code. */
export const CONTA_AZUL_AUTH_TOKEN =
  'https://auth.contaazul.com/oauth2/token';

/** Token endpoint do discovery OIDC (refresh na doc de renovação). */
export const CONTA_AZUL_API_TOKEN =
  'https://api-v2.contaazul.com/oauth/token';

export const CONTA_AZUL_API_BASE = 'https://api-v2.contaazul.com';

export const CONTA_AZUL_OAUTH_SCOPE =
  'openid profile aws.cognito.signin.user.admin';

/** Access token dura 3600s; renovar com folga. */
export const CONTA_AZUL_TOKEN_SKEW_MS = 120_000;

export const CONTA_AZUL_SESSION_ID = 'default';

export const CONTA_AZUL_REFRESH_LOCK_MS = 45_000;

export const CONTA_AZUL_REAUTH_MESSAGE =
  'Refresh token da Conta Azul inválido ou revogado. Reconecte em Financeiro (autorizar de novo). Isso só deveria ocorrer se a conexão foi revogada ou ficou muito tempo sem uso.';

export type ContaAzulTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
};

export function buildContaAzulAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: CONTA_AZUL_OAUTH_SCOPE,
  });
  return `${CONTA_AZUL_AUTH_LOGIN}?${params.toString()}`;
}

export function newOauthState(): string {
  return randomBytes(16).toString('hex');
}

export function basicAuthHeader(clientId: string, clientSecret: string): string {
  const raw = `${clientId}:${clientSecret}`;
  return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
}

export function isAccessTokenExpired(
  expiresAt: Date,
  now: Date = new Date(),
  skewMs = CONTA_AZUL_TOKEN_SKEW_MS,
): boolean {
  return expiresAt.getTime() - skewMs <= now.getTime();
}

export function expiryFromExpiresIn(
  expiresInSec: number | undefined,
  now: Date = new Date(),
): Date {
  const sec = Number.isFinite(expiresInSec) && (expiresInSec ?? 0) > 0
    ? Number(expiresInSec)
    : 3600;
  return new Date(now.getTime() + sec * 1000);
}

/**
 * Prisma/$queryRaw lê TIMESTAMP sem time zone como UTC. Na gravação o driver
 * usa o fuso do processo — sem este ajuste o access_token parece expirado
 * na hora e o refresh roda a cada request (e queima o refresh rotativo).
 */
export function fromDbSessionTimestamp(value: Date): Date {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
}

export function invoiceDigits(raw: string | number | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '');
}

export function objectKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).sort();
}

export function firstArrayItem(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return null;
  const rec = payload as Record<string, unknown>;
  const list = rec.itens ?? rec.items ?? rec.data;
  if (Array.isArray(list) && list.length > 0) return list[0];
  return null;
}

export function stringifyOauthError(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (raw instanceof Error) {
    const data = (raw as Error & { response?: { data?: unknown } }).response
      ?.data;
    if (typeof data === 'string') return `${raw.message} ${data}`;
    if (data && typeof data === 'object') {
      try {
        return `${raw.message} ${JSON.stringify(data)}`;
      } catch {
        return raw.message;
      }
    }
    return raw.message;
  }
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }
  return String(raw);
}

export function isContaAzulInvalidGrant(raw: unknown): boolean {
  const text = stringifyOauthError(raw).toLowerCase();
  return (
    text.includes('invalid_grant') ||
    text.includes('invalid refresh') ||
    text.includes('refresh token is expired')
  );
}

export type RefreshAfterInvalidGrantAction =
  | 'use_session'
  | 'retry_refresh'
  | 'reauth';

/** Depois de invalid_grant: o banco pode já ter o token novo de outro processo. */
export function decideAfterInvalidGrant(input: {
  usedRefreshToken: string;
  loaded: { refreshToken: string; expiresAt: Date } | null;
  now?: Date;
}): RefreshAfterInvalidGrantAction {
  const loaded = input.loaded;
  if (!loaded) return 'reauth';
  if (!isAccessTokenExpired(loaded.expiresAt, input.now)) {
    return 'use_session';
  }
  if (loaded.refreshToken && loaded.refreshToken !== input.usedRefreshToken) {
    return 'retry_refresh';
  }
  return 'reauth';
}
