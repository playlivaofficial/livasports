import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('next/link',()=>({default:({href,children,...props}:import('react').ComponentProps<'a'>)=><a href={href} {...props}>{children}</a>}));
import {renderToStaticMarkup} from 'react-dom/server';
import {SportsRepository} from './repository';
import {CORE_GEOS,geoProfile} from '@/config/geo';
import {CANONICAL_COMPETITION_TARGETS} from '@/config/footballCompetitions';
import {CompetitionNav,competitionNavSections} from '@/components/sports/CompetitionNav';
import {CompetitionTabs} from '@/components/sports/CompetitionTabs';
import {weekHomeSections} from '@/components/sports/home-density';
import {groupFixtureViews} from '@/delivery/fixtures';
import type {CompetitionSectionView,FixtureView} from '@/delivery/types';
import type {QueryExecutor} from '@/database/client';

describe('shared GEO priority reaches existing sports discovery surfaces',()=>{
  it.each(CORE_GEOS)('%s nav consumes only its persisted Top 5 and links to its canonical locale',async geo=>{
    const profile=geoProfile(geo),locale=profile.locale as 'mx'|'co'|'pe',localSlug=geo==='MX'?'liga-mx':geo==='CO'?'colombia-primera-a':'peru-liga-1';
    const rows=CANONICAL_COMPETITION_TARGETS.map(t=>({slug:t.slug,canonical_name:t.canonicalName,display_name_es_mx:t.displayNames.mx,competition_group:t.group,region:t.region,country_code:t.countryCode,n:3,growth_rank:t.slug===localSlug?1:t.slug==='champions-league'?2:null}));
    const query=vi.fn<(_sql:string,_values?:unknown[])=>Promise<{rows:typeof rows}>>().mockResolvedValue({rows});
    const nav=await new SportsRepository({query} as unknown as QueryExecutor).boardNav(locale,profile.timeZone);
    expect(nav[0].slug).toBe(localSlug);expect(nav[0].priority).toBe(-99);expect(nav[1].slug).toBe('champions-league');
    const [sql,values]=query.mock.calls[0];expect(values?.[2]).toBe(geo);
    expect(sql).toContain('p.geo=$3');expect(sql).toContain('p.active AND p.priority_rank<=5');expect(sql).toContain("f.status='SCHEDULED'");
    expect(sql).toContain("f.kickoff>now()");expect(sql).not.toContain('priority_br');
    const sections=competitionNavSections(locale,nav);expect(sections[0].items[0].slug).toBe(localSlug);
    const html=renderToStaticMarkup(<CompetitionNav locale={locale} items={nav} allHref={'/'+locale+'/futbol'} allLabel="Todas" title="Competiciones"/>);
    expect(html).toContain(`href="/${locale}/futbol?competition=${localSlug}"`);expect(html).not.toContain('href="/br/');expect(html).not.toContain('href="/es-');
    expect(html).toContain(geo==='MX'?'México':geo==='CO'?'Colombia':'Perú');
  });
  it('homepage competition prominence does not scramble chronological fixture usability',()=>{
    const now=Date.parse('2026-10-04T12:00:00Z'),fixture=(id:string,kickoff:string,competitionPriority:number,competitionSlug:string)=>({id,kickoff,status:'SCHEDULED',competitionPriority,competitionSlug,competition:competitionSlug}) as FixtureView;
    const fixtures=[fixture('later','2026-10-06T20:00:00Z',-99,'peru-liga-1'),fixture('earlier','2026-10-05T20:00:00Z',-99,'peru-liga-1'),fixture('first','2026-10-04T18:00:00Z',70,'premier-league')];
    const sections=groupFixtureViews(fixtures),out=weekHomeSections(sections,{from:now,to:now+7*86400000},now);
    expect(out.map(s=>s.slug)).toEqual(['peru-liga-1','premier-league']);expect(out[0].fixtures.map(f=>f.id)).toEqual(['earlier','later']);
  });
  it.each(['co','pe'] as const)('%s grouped discovery uses Spanish and passed shared priority, not a Brazil-first group override',locale=>{
    const sections:CompetitionSectionView[]=[{competition:'Brasileirão',slug:'brasileirao-serie-a',priority:90,group:'BRAZIL',fixtures:[]},{competition:'Liga local',slug:'local',priority:-99,group:'AMERICAS',fixtures:[]}];
    const html=renderToStaticMarkup(<CompetitionTabs locale={locale} sections={sections}/>);
    expect(html.indexOf('>Américas<')).toBeLessThan(html.indexOf('>Brasil<'));expect(html).toContain('Competiciones');expect(html).not.toContain('Competições');
    expect(html).toContain('href="#competition-local"');
  });
});
