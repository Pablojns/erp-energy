import type { Params } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { LevelWithSilent } from 'pino';
import { getRequestContext } from './request-context';
import { PINO_REDACT_PATHS, sanitizeForLog } from './masking';

function getLevelFromStatus(
  statusCode: number,
  err?: Error,
): LevelWithSilent {
  if (err) return 'error';
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

export function buildNestPinoParams(): Params {
  return {
    pinoHttp: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: {
        paths: PINO_REDACT_PATHS,
        censor: '[REDACTED]',
      },
      genReqId: (req, res) => {
        const headerValue = req.headers['x-request-id'];
        const requestId =
          typeof headerValue === 'string' && headerValue.trim()
            ? headerValue.trim()
            : randomUUID();
        res.setHeader('x-request-id', requestId);
        return requestId;
      },
      customLogLevel: (_req, res, err) => getLevelFromStatus(res.statusCode, err),
      serializers: {
        req: (req) =>
          sanitizeForLog({
            id: req.id,
            method: req.method,
            url: req.url,
            remoteAddress: req.remoteAddress,
            userAgent: req.headers['user-agent'],
          }),
        res: (res) =>
          sanitizeForLog({
            statusCode: res.statusCode,
          }),
        err: (err) =>
          sanitizeForLog({
            name: err.name,
            message: err.message,
            stack: err.stack,
          }),
      },
      mixin: () => {
        const ctx = getRequestContext();
        if (!ctx) return {};
        return {
          requestId: ctx.requestId,
          userId: ctx.userId ?? null,
          action: ctx.action ?? null,
        };
      },
    },
  };
}
