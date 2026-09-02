export interface SafeProviderErrorContext {
  provider: string;
  status: number;
  endpoint: string;
  query: Readonly<Record<string, string>>;
  code: string | null;
  message: string;
}

const SECRET_KEYS = /api.?key|token|authorization|secret/i;

export function sanitizeText(value: string, secrets: readonly string[]): string {
  return secrets.filter(Boolean).reduce((safe, secret) => safe.split(secret).join('[REDACTED]'), value);
}

export function sanitizeQuery(query: URLSearchParams): Record<string, string> {
  return Object.fromEntries([...query].map(([key, value]) => [key, SECRET_KEYS.test(key) ? '[REDACTED]' : value]));
}

export class SafeProviderError extends Error {
  constructor(readonly context: SafeProviderErrorContext) {
    super(`${context.provider} ${context.status} ${context.endpoint}: ${context.message}`);
    this.name = 'SafeProviderError';
  }
}
