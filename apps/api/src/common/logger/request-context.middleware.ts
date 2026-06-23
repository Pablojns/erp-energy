import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from './request-context';

export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const headerValue = req.headers['x-request-id'];
  const requestId =
    typeof headerValue === 'string' && headerValue.trim()
      ? headerValue.trim()
      : randomUUID();

  res.setHeader('x-request-id', requestId);

  runWithRequestContext(
    {
      requestId,
      action: `${req.method} ${req.originalUrl}`,
      userId: null,
    },
    () => next(),
  );
}
