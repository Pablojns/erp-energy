'use client';

export type ClientLogLevel = 'info' | 'warn' | 'error' | 'fatal';

type ClientLogMeta = Record<string, unknown> | undefined;

const SENSITIVE_KEY_RE =
  /(pass(word|wd|phrase)?|secret|token|authorization|cookie|cpf|cnpj|email|phone|telefone|document|documento)/i;

function mask(input: string): string {
  const value = input.trim();
  if (!value) return value;
  if (value.length <= 4) return '***';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = typeof raw === 'string' ? mask(raw) : '[REDACTED]';
        continue;
      }
      out[key] = sanitize(raw);
    }
    return out;
  }
  return String(value);
}

function contextBase(action?: string): Record<string, unknown> {
  return {
    layer: 'frontend',
    action: action ?? null,
    path:
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : null,
    timestamp: new Date().toISOString(),
  };
}

function write(level: ClientLogLevel, message: string, meta?: ClientLogMeta): void {
  const payload = {
    level,
    message,
    ...contextBase(typeof meta?.action === 'string' ? meta.action : undefined),
    ...(meta ? (sanitize(meta) as Record<string, unknown>) : {}),
  };

  const out = JSON.stringify(payload);
  if (level === 'info') console.info(out);
  else if (level === 'warn') console.warn(out);
  else if (level === 'error') console.error(out);
  else console.error(out);
}

export const clientLogger = {
  info(message: string, meta?: ClientLogMeta) {
    write('info', message, meta);
  },
  warn(message: string, meta?: ClientLogMeta) {
    write('warn', message, meta);
  },
  error(message: string, meta?: ClientLogMeta) {
    write('error', message, meta);
  },
  fatal(message: string, meta?: ClientLogMeta) {
    write('fatal', message, meta);
  },
};
