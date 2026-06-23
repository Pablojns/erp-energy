import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  requestId: string;
  action?: string;
  userId?: string | null;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T,
): T {
  return requestContextStorage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function updateRequestContext(
  patch: Partial<RequestContext>,
): RequestContext | undefined {
  const current = requestContextStorage.getStore();
  if (!current) return undefined;
  const next = { ...current, ...patch };
  requestContextStorage.enterWith(next);
  return next;
}
