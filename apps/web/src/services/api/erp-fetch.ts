/** Extrai texto útil das respostas de erro do NestJS (validation pipe pode retornar `message` como string[]). */
import { generateUUID } from '@/src/lib/uuid';
import { clientLogger } from '@/src/services/observability/client-logger';

function createRequestId(): string {
  return generateUUID();
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return false;
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

/**
 * Teto de espera de qualquer chamada ao ERP. Sem isso, uma requisição pendurada
 * deixava a tela em "carregando" para sempre (o estado só é liberado quando a
 * requisição mais recente termina).
 */
const ERP_FETCH_TIMEOUT_MS = 35_000;

function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError';
}

/** Combina o sinal do chamador (cancelamento por digitação) com o timeout. */
function buildSignal(external: AbortSignal | null | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(ERP_FETCH_TIMEOUT_MS);
  if (!external) return timeout;
  const anyAbort = (
    AbortSignal as unknown as {
      any?: (signals: AbortSignal[]) => AbortSignal;
    }
  ).any;
  if (typeof anyAbort === 'function') {
    return anyAbort([external, timeout]);
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (external.aborted) abort();
  else external.addEventListener('abort', abort, { once: true });
  timeout.addEventListener('abort', abort, { once: true });
  return controller.signal;
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
      cache: 'no-store',
      ...init,
      credentials: 'include',
      signal: buildSignal(init?.signal),
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': requestId,
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      clientLogger.error('ERP fetch timed out', {
        action: 'erp.fetch.timeout',
        requestId,
        path: `/api/erp/${path}`,
        method: init?.method ?? 'GET',
      });
      throw new Error(
        'A requisição demorou demais e foi cancelada. Verifique a conexão e tente novamente.',
      );
    }
    if (!isAbortError(error)) {
      clientLogger.error('Network error in ERP fetch', {
        action: 'erp.fetch.network',
        requestId,
        path: `/api/erp/${path}`,
        method: init?.method ?? 'GET',
        error,
      });
    }
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
