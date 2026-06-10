/** Extrai texto útil das respostas de erro do NestJS (validation pipe pode retornar `message` como string[]). */
function nestErrorMessage(payload: unknown, fallbackStatus: number): string {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('message' in payload) ||
    payload.message === undefined
  ) {
    return `Erro HTTP ${fallbackStatus}`;
  }
  const raw = payload.message;
  if (Array.isArray(raw)) {
    return raw.map((part) => String(part)).join(' · ');
  }
  return String(raw);
}

/** Chamadas autenticadas ao Nest via Route Handler `/api/erp/*` (cookie httpOnly). */
export async function erpFetchJson<T>(
  segmentsPath: string,
  init?: RequestInit,
): Promise<T> {
  const path = segmentsPath
    .replace(/^\//, '')
    .replace(/^api\/erp\/?/, '')
    .replace(/^api\//, '');
  const res = await fetch(`/api/erp/${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { message: text };
    }
  }

  if (!res.ok) {
    throw new Error(nestErrorMessage(body, res.status));
  }

  return body as T;
}
