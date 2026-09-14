export interface OddsPapiHttpError {
  status: number;
  code: string | null;
}

export function parseOddsPapiHttpError(error: unknown): OddsPapiHttpError | null {
  const message = error instanceof Error ? error.message : '';
  try {
    const body = JSON.parse(message) as {status?: unknown; body?: {error?: {code?: unknown}}};
    if (!Number.isInteger(body.status)) return null;
    const code = typeof body.body?.error?.code === 'string' ? body.body.error.code : null;
    return {status: body.status as number, code};
  } catch {
    return null;
  }
}

export function isProviderFixtureAbsent(error: unknown): boolean {
  const parsed = parseOddsPapiHttpError(error);
  return parsed?.status === 404 && parsed.code === 'FIXTURE_NOT_FOUND';
}
