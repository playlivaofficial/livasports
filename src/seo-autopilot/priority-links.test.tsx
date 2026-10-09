import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('server-only',()=>({}));
const {query}=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('@/database/client',()=>({databaseUrl:()=> 'test-only',PostgresDatabaseClient:class {query=query;}}));
import {SeoPriorityLinks} from './public';
describe('compact country-scoped SEO links',()=>{
 it('retains genuine inbound links without restoring a giant public priority panel',async()=>{
  query.mockResolvedValue({rows:[{url:'https://livasports.com/co/partido/a-x-b-0123456789abcdef',home:'A',away:'B',competition:'Liga BetPlay'}]});
  const html=renderToStaticMarkup(await SeoPriorityLinks({locale:'co',surface:{kind:'HOME'}}));
  expect(html).toContain('<nav');expect(html).toContain('seo-priority-links');expect(html).toContain('/co/partido/a-x-b-0123456789abcdef');expect(html).not.toContain('growth-prominence');expect(html).not.toContain('<h2');
  expect(query.mock.calls.at(-1)?.[1]).toEqual(['co']);
 });
 it('never reactivates a retired Brazil or neutral ROW priority surface',async()=>{
  query.mockClear();expect(await SeoPriorityLinks({locale:'br',surface:{kind:'HOME'}})).toBeNull();expect(await SeoPriorityLinks({locale:'en',surface:{kind:'HOME'}})).toBeNull();expect(query).not.toHaveBeenCalled();
 });
});
