import { API_BASE_URL } from './config';

/** Timeout para `/auth/me` no layout — evita pendurar SSR se a API estiver lenta. */
const REQUEST_ME_TIMEOUT_MS = 12_000;

/** Mensagem legível a partir do JSON de erro do Nest (`message` string ou array). */
export function formatNestAuthError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'Não foi possível autenticar.';
  }
  const m = (payload as { message?: unknown }).message;
  if (typeof m === 'string' && m.trim()) return m;
  if (Array.isArray(m)) {
    const parts = m.filter((x): x is string => typeof x === 'string');
    if (parts.length) return parts.join(' ');
  }
  return 'Não foi possível autenticar.';
}

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roles: string[];
};

export type AuthResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: AuthUser;
};

/**
 * Valida sessão contra `/auth/me`.
 * Em falha de rede (API offline, ECONNREFUSED, timeout), retorna `null` — não lança para não derrubar RSC.
 */
export async function requestMe(
  token: string,
): Promise<{ user: AuthUser } | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    REQUEST_ME_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { user?: AuthUser };
    if (!payload?.user) {
      return null;
    }

    return { user: payload.user };
  } catch {
    // fetch failed / AbortError / JSON inválido — tratar como sessão indisponível
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
