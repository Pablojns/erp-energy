import { generateUUID } from '@/src/lib/uuid';
import { clientLogger } from '@/src/services/observability/client-logger';
import type {
  PurchaseListResponse,
  PurchaseRequest,
  PurchaseStage,
} from './compras-types';

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

export async function erpFetchFormData<T>(
  segmentsPath: string,
  formData: FormData,
  init?: Omit<RequestInit, 'body'>,
): Promise<T> {
  const path = segmentsPath
    .replace(/^\//, '')
    .replace(/^api\/erp\/?/, '')
    .replace(/^api\//, '');
  const requestId = createRequestId();

  const res = await fetch(`/api/erp/${path}`, {
    ...init,
    method: init?.method ?? 'POST',
    credentials: 'include',
    headers: {
      'x-request-id': requestId,
      ...(init?.headers ?? {}),
    },
    body: formData,
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
    clientLogger.error('ERP FormData request failed', {
      action: 'erp.fetch.formdata_error',
      requestId,
      path: `/api/erp/${path}`,
      statusCode: res.status,
      responseBody: body,
    });
    throw new Error(nestErrorMessage(body, res.status));
  }

  return body as T;
}

export async function fetchPurchaseRequests(params: URLSearchParams): Promise<PurchaseRequest[]> {
  const { erpFetchJson } = await import('@/src/services/api/erp-fetch');
  const res = await erpFetchJson<PurchaseListResponse>(
    `api/compras?${params.toString()}`,
  );
  return res.data;
}

export async function fetchPurchaseDetail(id: string): Promise<PurchaseRequest> {
  const { erpFetchJson } = await import('@/src/services/api/erp-fetch');
  return erpFetchJson<PurchaseRequest>(`api/compras/${id}`);
}

/**
 * Move a solicitação para uma etapa.
 * `details` só é necessário quando a etapa de destino pede valor/data
 * (requiresPurchaseDetails) ou motivo (requiresReason).
 */
export async function updatePurchaseStatus(
  id: string,
  status: string,
  details?: {
    purchaseValue?: number;
    purchasedAt?: string;
    refusalReason?: string;
  },
): Promise<PurchaseRequest> {
  const { erpFetchJson } = await import('@/src/services/api/erp-fetch');
  return erpFetchJson<PurchaseRequest>(`api/compras/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...(details ?? {}) }),
  });
}

export async function listPurchaseStages(): Promise<PurchaseStage[]> {
  const { erpFetchJson } = await import('@/src/services/api/erp-fetch');
  return erpFetchJson<PurchaseStage[]>('api/compras/stages');
}

export async function createPurchaseStage(body: {
  name: string;
  order?: number;
  color?: string | null;
  requiresPurchaseDetails?: boolean;
  requiresReason?: boolean;
}): Promise<PurchaseStage> {
  const { erpFetchJson } = await import('@/src/services/api/erp-fetch');
  return erpFetchJson<PurchaseStage>('api/compras/stages', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updatePurchaseStage(
  id: string,
  body: {
    name?: string;
    order?: number;
    color?: string | null;
    requiresPurchaseDetails?: boolean;
    requiresReason?: boolean;
  },
): Promise<PurchaseStage> {
  const { erpFetchJson } = await import('@/src/services/api/erp-fetch');
  return erpFetchJson<PurchaseStage>(`api/compras/stages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deletePurchaseStage(id: string): Promise<{ ok: boolean }> {
  const { erpFetchJson } = await import('@/src/services/api/erp-fetch');
  return erpFetchJson<{ ok: boolean }>(`api/compras/stages/${id}`, {
    method: 'DELETE',
  });
}
