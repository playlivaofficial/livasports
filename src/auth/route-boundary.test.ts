import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({
  url: null as string | null,
  query: vi.fn(),
  get: vi.fn(async () => Response.json({ user: null })),
  post: vi.fn(async () => new Response(null, { status: 204 })),
}));
vi.mock('@/database/client', () => ({ databaseUrl: () => state.url, PostgresDatabaseClient: class { query = state.query; } }));
vi.mock('@/auth/config', () => ({ handlers: { GET: state.get, POST: state.post } }));
import { GET, POST } from '@/app/api/auth/[...nextauth]/route';

beforeEach(() => {
  state.url = null;
  state.query.mockReset(); state.get.mockClear(); state.post.mockClear();
  vi.stubEnv('VERCEL', ''); vi.stubEnv('AUTH_SECRET', 'TEST-only-request-limit-secret-material');
});
afterEach(() => vi.unstubAllEnvs());

describe('preserved authentication route boundary', () => {
  it('fails closed with 503, not a retired-route 404, when no database is configured', async () => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('V3_LOCAL_DATA_PREVIEW', 'true');
    for (const handler of [GET, POST]) {
      const response = await handler(new Request('http://localhost/api/auth/session'));
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.json()).toEqual({ error: 'TEMPORARILY_UNAVAILABLE', providerRequests: 0 });
    }
    expect(state.get).not.toHaveBeenCalled(); expect(state.post).not.toHaveBeenCalled();
    expect(state.query).not.toHaveBeenCalled();
  });
  it('still delegates session reads and sign-in requests after the durable limiter allows them', async () => {
    state.url = 'TEST-only-database';
    state.query.mockResolvedValue({ rows: [{ allowed: true, retry_after: 60 }] });
    const request = new Request('https://livasports.com/api/auth/session');
    expect((await GET(request)).status).toBe(200);
    expect((await POST(request)).status).toBe(204);
    expect(state.get).toHaveBeenCalledWith(request); expect(state.post).toHaveBeenCalledWith(request);
    expect(state.query.mock.calls.some(call => String(call[0]).includes('INSERT INTO request_rate_limits'))).toBe(true);
  });
  it('never turns a rate-limited auth request into an unguarded session read', async () => {
    state.url = 'TEST-only-database';
    state.query.mockResolvedValue({ rows: [{ allowed: false, retry_after: 45 }] });
    const response = await GET(new Request('https://livasports.com/api/auth/session'));
    expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('45');
    expect(state.get).not.toHaveBeenCalled();
  });
});
