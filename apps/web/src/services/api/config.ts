/** URL da API Nest (server-side e browser via mesma base pública em dev). */
export function getBackendApiBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.API_BASE_URL?.trim() ||
    'http://localhost:3001';
  return raw.replace(/\/+$/, '');
}

export const API_BASE_URL = getBackendApiBaseUrl();

/** Rota Next.js que limpa o cookie httpOnly e redireciona ao login (uso em Server Components). */
export const AUTH_LOGOUT_ROUTE = '/api/auth/logout';

export const AUTH_COOKIE_NAME = 'erp_token';
