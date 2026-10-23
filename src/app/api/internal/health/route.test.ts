import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('next/server',()=>({connection:vi.fn(async()=>{})}));
import {GET} from './route';
afterEach(()=>vi.unstubAllEnvs());
describe('release health identity',()=>{
  it('prefers the valid platform commit',async()=>{
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA','a'.repeat(40));vi.stubEnv('LIVASPORTS_RELEASE_SHA','b'.repeat(40));
    const response=await GET();expect((await response.json()).release.commit).toBe('a'.repeat(40));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it.each(['','invalid','sensitive-looking-invalid-value'])('uses release fallback when platform value is %s',async value=>{
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA',value);vi.stubEnv('LIVASPORTS_RELEASE_SHA','b'.repeat(40));
    expect((await (await GET()).json()).release.commit).toBe('b'.repeat(40));
  });
  it('does not expose invalid configured values',async()=>{
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA','invalid-platform');vi.stubEnv('LIVASPORTS_RELEASE_SHA','invalid-fallback');
    const body=await (await GET()).json();expect(body.release.commit).toBeNull();expect(body.providerRequests).toBe(0);
    expect(JSON.stringify(body)).not.toContain('invalid-');
  });
});
