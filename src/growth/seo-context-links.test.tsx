import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
vi.mock('server-only',()=>({}));
const {query,close}=vi.hoisted(()=>({query:vi.fn(),close:vi.fn()}));
vi.mock('@/database/client',()=>({databaseUrl:()=> 'test-only',PostgresDatabaseClient:class {query=query;close=close;}}));
vi.mock('@/sports/SportsLink',()=>({default:({children,...props}:React.ComponentProps<'a'>)=><a {...props}>{children}</a>}));
import {GrowthProminence} from './GrowthProminence';

describe('Brazil contextual crawl links',()=>{
  it('keeps shared ranking order and adds canonical sibling links, not nested anchors',async()=>{
    query.mockResolvedValue({rows:[{fixture_id:'f',priority_rank:1,priority_score:80,canonical_url:'https://livasports.com/br/jogo/sao-paulo-x-santos-0123456789abcdef',context_pt_br:'Context',competition:'Brasileirão Série A',competition_slug:'brasileirao-serie-a',kickoff:'2026-10-01T20:00:00Z',home:'São Paulo',away:'Santos',home_public_id:'1111111111111111',away_public_id:'2222222222222222',brazil_relevant:true}]});
    const $=load(renderToStaticMarkup(await GrowthProminence({locale:'br',surface:{kind:'HOME'}})));
    expect($('.growth-context-links a').length).toBe(3);
    expect($('.growth-context-links a').first().attr('href')).toBe('/br/futebol?competition=brasileirao-serie-a');
    expect($('.growth-context-links a').eq(1).attr('href')).toBe('/br/time/sao-paulo-1111111111111111');
    expect($('a a').length).toBe(0);expect(query.mock.calls.at(-1)?.[0]).toContain('ORDER BY p.priority_rank LIMIT 5');
  });
  it('does not add Brazil-specific blocks to English or Spanish navigation',async()=>{
    query.mockClear();expect(await GrowthProminence({locale:'en',surface:{kind:'HOME'}})).toBeNull();
    expect(await GrowthProminence({locale:'mx',surface:{kind:'HOME'}})).toBeNull();expect(query).not.toHaveBeenCalled();
  });
});
