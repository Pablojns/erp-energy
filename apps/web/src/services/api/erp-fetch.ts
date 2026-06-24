/** Extrai texto útil das respostas de erro do NestJS (validation pipe pode retornar `message` como string[]). */
import { generateUUID } from '@/src/lib/uuid';
import { clientLogger } from '@/src/services/observability/client-logger';

function createRequestId(): string {
  return generateUUID();
}

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
  const requestId = createRequestId();
  let res: Response;
  try {
    res = await fetch(`/api/erp/${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': requestId,
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    clientLogger.error('Network error in ERP fetch', {
      action: 'erp.fetch.network',
      requestId,
      path: `/api/erp/${path}`,
      method: init?.method ?? 'GET',
      error,
    });
    throw error;
  }

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
    const responseRequestId = res.headers.get('x-request-id');
    clientLogger.error('ERP API request failed', {
      action: 'erp.fetch.http_error',
      requestId,
      responseRequestId,
      path: `/api/erp/${path}`,
      method: init?.method ?? 'GET',
      statusCode: res.status,
      responseBody: body,
    });
    throw new Error(
      res.status === 403
        ? 'Você não tem permissão para realizar esta ação.'
        : nestErrorMessage(body, res.status),
    );
  }

  return body as T;
}
