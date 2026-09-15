import {describe,expect,it,vi} from 'vitest';
vi.mock('next/link',()=>({default:({href,children,...props}:{href:string;children:import('react').ReactNode})=> <a href={href} {...props}>{children}</a>}));
import {renderToStaticMarkup} from 'react-dom/server';
import {CompetitionNav,competitionNavSections} from './CompetitionNav';
import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';

describe('competition navigation',()=>{
  const items=[
    {slug:'brasileirao-serie-a',name:'Brasileirão Série A',group:'BRAZIL',count:1,countryCode:'BR',countryName:'Brazil',region:'BRAZIL'},
    {slug:'copa-do-brasil',name:'Copa do Brasil',group:'BRAZIL',count:0,countryCode:'BR',countryName:'Brazil',region:'BRAZIL'},
    {slug:'liga-mx',name:'Liga MX',group:'AMERICAS',count:2,countryCode:'MX',countryName:'Mexico',region:'NORTH_AMERICA'},
    {slug:'premier-league',name:'Premier League',group:'EUROPE',count:1,countryCode:'GB',countryName:'England',region:'EUROPE'},
  ];
  it('keeps flags, names and counts as separate elements and links to the competition hub',()=>{
    const html=renderToStaticMarkup(<CompetitionNav locale="br" items={items} activeSlug="liga-mx" allHref="/br/futebol" allLabel="Todas" title="Competições"/>);
    expect(html).toContain('https://flagcdn.com/br.svg');
    expect(html).toContain('https://flagcdn.com/mx.svg');
    expect(html).toContain('https://flagcdn.com/gb-eng.svg');
    expect(html).toContain('class="competition-nav-name">Brasileirão Série A');
    expect(html).toContain('class="competition-nav-count">1');
    expect(html).not.toContain('Brasileirão Série A1');
    expect(html).not.toContain('Liga MX2');
    expect(html).toContain('href="/br/futebol?competition=premier-league"');
    expect(html).toContain('aria-label="Premier League, 1"');
    expect(html).toContain('href="/br/futebol?competition=liga-mx"');
    expect(html).not.toContain('#competition-');
    expect(html).toContain('Copa do Brasil');
    expect(html).toContain('class="competition-nav-control"');
    expect(html).toContain('>Competições</label>');
    expect(html).toContain('id="competition-nav-toggle"');
    expect(html).toContain('id="competition-nav-panel"');
    expect(html).toContain('aria-controls="competition-nav-panel"');
    expect(html).not.toContain('checked');
    expect(html.indexOf('>Brasil</h3>')).toBeLessThan(html.indexOf('>Inglaterra</h3>'));
    expect(html.indexOf('>Inglaterra</h3>')).toBeLessThan(html.indexOf('>México</h3>'));
  });
  it('groups all 34 competitions exactly once in the required deterministic country order',()=>{
    const all=FOOTBALL_COMPETITION_TARGETS.map(target=>({slug:target.slug,name:target.canonicalName,group:target.group,count:0,countryCode:target.countryCode,countryName:target.countryNames[0]??null,region:target.region}));
    const sections=competitionNavSections('en',all),flattened=sections.flatMap(section=>section.items.map(item=>item.slug));
    expect(flattened).toHaveLength(34);expect(new Set(flattened).size).toBe(34);
    expect(sections.map(section=>section.label)).toEqual(['Brazil','England','Spain','Italy','Germany','France','Portugal','Netherlands','Türkiye','Argentina','Mexico','USA','Saudi Arabia','UEFA / International','South America','North & Central America']);
  });
  it('keeps canonical international competitions neutral when provider metadata uses pseudo-country codes',()=>{
    const rows=[
      {slug:'champions-league',name:'Champions League',group:'EUROPE',count:1,countryCode:'EU',countryName:'Europe',region:'EUROPE'},
      {slug:'copa-libertadores',name:'Libertadores',group:'AMERICAS',count:1,countryCode:'SA',countryName:'South America',region:'SOUTH_AMERICA'},
    ];
    expect(competitionNavSections('en',rows).map(section=>section.key)).toEqual(['INT-EUROPE','INT-SOUTH_AMERICA']);
  });
});
