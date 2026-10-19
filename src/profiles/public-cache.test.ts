import {readFileSync} from 'node:fs';
import {describe,expect,it,vi,afterEach} from 'vitest';
import {GET} from '@/app/api/profiles/team-history/route';
import {teamHistoryKey,teamHistorySelection,type TeamHistoryProfile} from './history-policy';
afterEach(()=>vi.restoreAllMocks());
describe('historical profile cache and identity',()=>{
 it.each(['br/time','mx/equipo','co/equipo','pe/equipo','en/team','br/jogador','mx/jugador','co/jugador','pe/jugador','en/player'])('%s retains on-demand static canonical history',route=>{
  const source=readFileSync('src/app/'+route+'/[profile]/page.tsx','utf8');
  expect(source).toMatch(/revalidate\s*=\s*false/);expect(source).toContain('generateStaticParams=()=>[];');
  expect(source).toContain('ArchivePage');expect(source).not.toMatch(/force-dynamic|profiles\/runtime|requestOwnerSession|next\/headers/);
 });
 it('archive queries are bounded, read-only, and not a sports freshness poll',()=>{
  const source=readFileSync('src/v2/archive.tsx','utf8');
  expect(source).toContain('statementTimeoutMs:5000');expect(source).toContain('LIMIT 10');expect(source).toContain('WHERE public_id=$1');
  expect(source).not.toMatch(/INSERT |UPDATE |DELETE |sports\/runtime|Sportmonks|OddsPapi|setInterval/);expect(source).toContain('permanentRedirect(path)');
 });
 it('keeps the archived history-selection identity rules intact',()=>{
  const season='11111111-1111-4111-8111-111111111111',profile={competitions:[{seasonId:season}]} as TeamHistoryProfile;
  expect(teamHistorySelection(profile,new URLSearchParams('matches=fixtures&p=9999&season='+season))).toEqual({view:'fixtures',page:1000,season});
  expect(teamHistoryKey(teamHistorySelection(profile,new URLSearchParams()))).toBe('results:1:all');
 });
});
describe('retired live profile island',()=>{
 it.each(['br','mx','co','pe','en','CO','es-CO','cl',''])('never resumes live lookup for locale %s',async locale=>{
  const fetch=vi.spyOn(globalThis,'fetch');const response=await GET(new Request('https://livasports.com/api/profiles/team-history?locale='+locale));
  expect(response.status).toBe(410);expect(await response.json()).toEqual({state:'RETIRED_IN_V2',providerRequests:0});expect(fetch).not.toHaveBeenCalled();expect(response.headers.has('set-cookie')).toBe(false);
 });
 it.each(['refresh=1','p=1&p=2','id=arbitrary','geo=MX'])('does not bypass retirement with %s',async query=>{expect((await GET(new Request('https://livasports.com/api/profiles/team-history?'+query))).status).toBe(410);});
});
