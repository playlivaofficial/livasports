import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

describe('GitHub Actions odds ticker',()=>{
  const yaml=readFileSync(resolve(process.cwd(),'.github/workflows/odds-refresh.yml'),'utf8');
  it('schedules GET against the existing production scheduler with only CRON_SECRET',()=>{
    expect(yaml).toMatch(/cron:\s*'?2,7,12,17,22,27,32,37,42,47,52,57 \* \* \* \*'?/);
    expect(yaml).toContain('https://livasports.com/api/internal/odds-refresh');
    expect(yaml).toContain('-X GET');
    expect(yaml).toContain('secrets.CRON_SECRET');
    expect(yaml).not.toMatch(/ODDSPAPI_API_KEY|SPORTMONKS_API_KEY|DATABASE_URL|DATABASE_POSTGRES/);
  });
  it('does not stack overlapping ticks and treats no-work and in-flight leases as healthy',()=>{
    expect(yaml).toContain('group: livasports-odds-refresh');
    expect(yaml).toContain('cancel-in-progress: false');
    expect(yaml).toContain('contents: none');
    expect(yaml).toContain('code}" = "409"');
    expect(yaml).toContain('healthy tick including no-work requests=0');
    expect(yaml).toContain('state}" != "SUCCEEDED"');
  });
});
