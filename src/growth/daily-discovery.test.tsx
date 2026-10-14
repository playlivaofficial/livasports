import {describe,it,expect,vi,beforeEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('server-only',()=>({}));
const {priorityRead}=vi.hoisted(()=>({priorityRead:vi.fn()}));
vi.mock('./prominence-read',()=>({readPriorityLinks:priorityRead}));
vi.mock('@/database/client',()=>({databaseUrl:()=>null,PostgresDatabaseClient:class{}}));
import {SeoPriorityLinks} from '@/seo-autopilot/public';
beforeEach(()=>vi.clearAllMocks());
describe('daily deterministic server-rendered discovery',()=>{
 it.each(['mx','co','pe'] as const)('links all five persisted %s fixtures with real HTML anchors independently of metadata experiments',async locale=>{
  priorityRead.mockResolvedValue(Array.from({length:5},(_,i)=>({fixtureId:`f${i}`,rank:i+1,canonicalUrl:`https://livasports.com/${locale}/partido/home-x-away-${String(i).padStart(16,'0')}`,home:`Home ${i}`,away:'Away',competition:'League'})));
  const html=renderToStaticMarkup(await SeoPriorityLinks({locale,surface:{kind:'HOME'}}));
  expect(html.match(/<a /g)).toHaveLength(5);expect(html).toContain('data-growth-promotion="daily-top5"');expect(html).toContain(`data-growth-geo="${locale.toUpperCase()}"`);expect(html).toContain('data-growth-rank="5"');
  expect(html).not.toMatch(/noindex|nofollow|Matches to follow|growth-prominence-item/);
 });
 it('scopes competition/team discovery to the relevant surface and skips unsupported/historical locales',async()=>{
  priorityRead.mockResolvedValue([]);await SeoPriorityLinks({locale:'co',surface:{kind:'COMPETITION',slug:'colombia-primera-a'}});
  expect(priorityRead).toHaveBeenCalledWith({kind:'COMPETITION',slug:'colombia-primera-a'},'CO');
  priorityRead.mockClear();expect(await SeoPriorityLinks({locale:'br',surface:{kind:'HOME'}})).toBeNull();expect(priorityRead).not.toHaveBeenCalled();
 });
});
