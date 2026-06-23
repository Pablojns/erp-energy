const SENSITIVE_KEY_RE =
  /(pass(word|wd|phrase)?|secret|token|authorization|cookie|cpf|cnpj|email|phone|telefone|document|documento)/i;

function maskStringValue(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.length <= 4) return '***';
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}

export function sanitizeForLog(value: unknown): unknown {
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
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        output[key] =
          typeof raw === 'string' ? maskStringValue(raw) : '[REDACTED]';
        continue;
      }
      output[key] = sanitizeForLog(raw);
    }
    return output;
  }
  return String(value);
}

export const PINO_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.body.password',
  'req.body.passwordHash',
  'req.body.token',
  'req.body.accessToken',
  'req.body.refreshToken',
  'res.headers["set-cookie"]',
];
