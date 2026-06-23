import pino, { type Logger as PinoLogger } from 'pino';
import { getRequestContext } from './request-context';
import { PINO_REDACT_PATHS, sanitizeForLog } from './masking';

type LogMeta = Record<string, unknown> | undefined;

const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: PINO_REDACT_PATHS,
    censor: '[REDACTED]',
  },
  mixin() {
    const ctx = getRequestContext();
    if (!ctx) return {};
    return {
      requestId: ctx.requestId,
      userId: ctx.userId ?? null,
      action: ctx.action ?? null,
    };
  },
});

export class AppLogger {
  private readonly logger: PinoLogger;

  constructor(private readonly context: string) {
    this.logger = baseLogger.child({ context });
  }

  info(message: string, meta?: LogMeta): void {
    this.logger.info(this.withMeta(meta), message);
  }

  warn(message: string, meta?: LogMeta): void {
    this.logger.warn(this.withMeta(meta), message);
  }

  error(message: string, error?: unknown, meta?: LogMeta): void {
    const sanitizedError = error ? sanitizeForLog(error) : undefined;
    this.logger.error(
      this.withMeta({
        ...meta,
        error: sanitizedError,
      }),
      message,
    );
  }

  fatal(message: string, error?: unknown, meta?: LogMeta): void {
    const sanitizedError = error ? sanitizeForLog(error) : undefined;
    this.logger.fatal(
      this.withMeta({
        ...meta,
        error: sanitizedError,
      }),
      message,
    );
  }

  private withMeta(meta?: LogMeta): Record<string, unknown> {
    return meta ? (sanitizeForLog(meta) as Record<string, unknown>) : {};
  }
}
