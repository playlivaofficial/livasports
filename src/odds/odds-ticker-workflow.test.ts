import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

describe('GitHub Actions odds ticker',()=>{
  const yaml=readFileSync(resolve(process.cwd(),'.github/workflows/odds-refresh.yml'),'utf8');
  it('is the fallback ticker (10-minute schedule + manual dispatch) and does not hold provider or database credentials',()=>{
    expect(yaml).toContain('workflow_dispatch');
    // Fallback cadence since the 2026-09-21 stall: the external cron disabled itself on 503 answers; the backend lease de-duplicates.
    expect(yaml).toMatch(/^\s+schedule:/m);
    expect(yaml).toMatch(/cron: "\*\/10 \* \* \* \*"/);
    expect(yaml).toContain('https://livasports.com/api/internal/odds-refresh');
    expect(yaml).toContain('-X GET');
    expect(yaml).toContain('secrets.CRON_SECRET');
    expect(yaml).not.toMatch(/ODDSPAPI_API_KEY|SPORTMONKS_API_KEY|DATABASE_URL|DATABASE_POSTGRES/);
  });
  it('does not stack overlapping ticks and treats every completed tick (including no-work and failed refreshes) as a healthy invocation',()=>{
    expect(yaml).toContain('group: livasports-odds-refresh');
    expect(yaml).toContain('cancel-in-progress: false');
    expect(yaml).toContain('contents: none');
    expect(yaml).toContain('code}" = "409"');
    expect(yaml).toContain('tick completed state=');
    expect(yaml).not.toContain('state}" != "SUCCEEDED"');
  });
});
