import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {geoForLocale,geoProfile} from '@/config/geo';
import {TimePreferenceProvider} from '@/localization/TimeZoneSelector';
vi.mock('server-only',()=>({}));
const {query,close,requestTimeZone}=vi.hoisted(()=>({query:vi.fn(),close:vi.fn(),requestTimeZone:vi.fn(()=>{throw Error('Private timezone access breaks public ISR');})}));
vi.mock('@/database/client',()=>({databaseUrl:()=> 'test-only',PostgresDatabaseClient:class {query=query;close=close;}}));
vi.mock('@/localization/time-zone-server',()=>({requestTimeZone}));
vi.mock('@/sports/SportsLink',()=>({default:({children,...props}:React.ComponentProps<'a'>)=><a {...props}>{children}</a>}));
import {GrowthProminence} from './GrowthProminence';

describe('GEO contextual crawl links',()=>{
  it('keeps shared ranking order and adds canonical sibling links, not nested anchors',async()=>{
    query.mockResolvedValue({rows:[{fixture_id:'f',priority_rank:1,priority_score:80,canonical_url:'https://livasports.com/co/partido/sao-paulo-x-santos-0123456789abcdef',context_localized:'Context',competition:'Brasileirão Série A',competition_slug:'brasileirao-serie-a',kickoff:'2026-10-01T20:00:00Z',home:'São Paulo',away:'Santos',home_public_id:'1111111111111111',away_public_id:'2222222222222222',brazil_relevant:true}]});
    const $=load(renderToStaticMarkup(await GrowthProminence({locale:'co',surface:{kind:'HOME'}})));
    expect($('.growth-context-links a').length).toBe(3);
    expect($('.growth-context-links a').first().attr('href')).toBe('/co/futbol?competition=brasileirao-serie-a');
    expect($('.growth-context-links a').eq(1).attr('href')).toBe('/co/equipo/sao-paulo-1111111111111111');
    expect($('a a').length).toBe(0);expect(query.mock.calls.at(-1)?.[0]).toContain('ORDER BY p.priority_rank LIMIT 5');
    expect(query.mock.calls.at(-1)?.[0]).toContain("f.status='SCHEDULED'");expect(query.mock.calls.at(-1)?.[0]).toContain('f.kickoff>now()');
    expect(query.mock.calls.at(-1)?.[1]).toEqual(['HOME','CO']);
  });
  it('does not promote BR or neutral historic pages',async()=>{
    query.mockClear();expect(renderToStaticMarkup(await GrowthProminence({locale:'en',surface:{kind:'HOME'}}))).toBe('');
    expect(renderToStaticMarkup(await GrowthProminence({locale:'br',surface:{kind:'HOME'}}))).toBe('');expect(query).not.toHaveBeenCalled();
  });
  it.each(['mx','co','pe'] as const)('%s populated priorities are request-independent and hydrate private time separately',async locale=>{
    const kickoff='2026-10-04T00:41:00.000Z';
    query.mockResolvedValue({rows:[{fixture_id:'f',priority_rank:1,priority_score:80,canonical_url:`https://livasports.com/${locale}/partido/qa-local-x-qa-visitante-0123456789abcdef`,context_localized:'Context',competition:'QA Liga',competition_slug:'colombia-primera-a',kickoff,home:'QA Local',away:'QA Visitante',home_public_id:'1111111111111111',away_public_id:'2222222222222222'}]});
    const element=await GrowthProminence({locale,surface:{kind:'HOME'}}),profile=geoProfile(geoForLocale(locale));
    const shell=renderToStaticMarkup(element),$=load(shell);
    expect(requestTimeZone).not.toHaveBeenCalled();
    expect($('time').attr('datetime')).toBe(kickoff);
    expect($('time').text()).toBe(new Intl.DateTimeFormat(profile.languageTag,{timeZone:profile.timeZone,weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(kickoff)));
    const hydrated=load(renderToStaticMarkup(<TimePreferenceProvider manual="Asia/Tbilisi" device={null}>{element}</TimePreferenceProvider>));
    expect(hydrated('time').attr('datetime')).toBe(kickoff);
    expect(hydrated('time').text()).toBe(new Intl.DateTimeFormat(profile.languageTag,{timeZone:'Asia/Tbilisi',weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(kickoff)));
    expect(hydrated('time').text()).toContain('04:41');
    expect(renderToStaticMarkup(element)).toBe(shell);
  });
  it('drops a wrong-GEO canonical URL even if a malformed record is returned',async()=>{
    query.mockResolvedValue({rows:[{canonical_url:'https://livasports.com/co/partido/a'}]});
    expect(renderToStaticMarkup(await GrowthProminence({locale:'mx',surface:{kind:'HOME'}}))).toBe('');
  });
});
