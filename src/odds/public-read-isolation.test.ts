import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

describe('normal navigation never imports an odds provider',()=>{
  const files=['src/odds/runtime.ts','src/app/api/odds/[fixtureId]/route.ts','src/match-center/loader.ts',
    'src/odds/listing.ts','src/delivery/runtime.ts','src/delivery/M3RouteDataLoader.ts','src/delivery/DatabaseM2ReadService.ts'];
  it.each(files)('%s stays DB/cache-only',(file)=>{
    const source=readFileSync(resolve(process.cwd(),file),'utf8');
    expect(source).not.toMatch(/M5OddsPapiAdapter|HttpOddsPapiGateway|api\.oddspapi\.io|ODDSPAPI_API_KEY/);
    expect(source).toMatch(/providerRequests:\s*0|loadOddsComparisons|paidOddsRequests:\s*0|attachListingOdds/);
  });
});
