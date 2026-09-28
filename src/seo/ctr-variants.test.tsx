import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import type {MatchCenterView} from '@/match-center/types';
import {ctrMatchMetadata,ctrTeamMetadata} from './ctr-variants';
import {MatchQueryIntro} from './MatchQueryIntro';
import {SeoExperiments} from '@/owner/SeoExperiments';
import {isFinishedMatchDecayed} from './policy';
import {FixtureStatus} from '@/domain/enums';
const match={header:{publicId:'031d1cbb143b458e',status:'FINISHED',home:{name:'Birmingham City'},away:{name:'Middlesbrough'},competitionSlug:'championship',season:'2026/2027',kickoff:'2026-09-19T14:00:00Z'},lineups:{data:[{starters:[{name:'Player'}]}]},standings:{data:[{position:1}]}} as MatchCenterView;
describe('explicit CTR cohort',()=>{
  it('uses natural Spanish and factual post-match intent, with no stale kickoff claim',()=>{
    const v=ctrMatchMetadata('mx',match)!;
    expect(v.title).toBe('Birmingham City vs. Middlesbrough: alineaciones');
    expect(v.description).toContain('Championship 2026/2027');
    expect(v.description).not.toMatch(/hoy|odds|en vivo|14:00|predic/);
    expect(v.title.length+13).toBeLessThan(70);
  });
  it('does not change unrelated pages or locales and never promises missing lineups',()=>{
    expect(ctrMatchMetadata('en',match)).toBeNull();expect(ctrMatchMetadata('br',match)).toBeNull();
    expect(ctrMatchMetadata('mx',{...match,lineups:{...match.lineups,data:[]}})).toBeNull();
    expect(ctrMatchMetadata('mx',{...match,header:{...match.header,publicId:'aaaaaaaaaaaaaaaa'}})).toBeNull();
  });
  it('does not preserve a finished-state promise after a factual status correction',()=>{
    for(const status of [FixtureStatus.SCHEDULED,FixtureStatus.LIVE,FixtureStatus.POSTPONED,FixtureStatus.CANCELLED])expect(ctrMatchMetadata('mx',{...match,header:{...match.header,status}})).toBeNull();
  });
  it('is stable across time; finished decay remains entirely independent',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-28'));const before=ctrMatchMetadata('mx',match);
    vi.setSystemTime(new Date('2026-10-30'));expect(ctrMatchMetadata('mx',match)).toEqual(before);
    expect(isFinishedMatchDecayed('FINISHED',match.header.kickoff)).toBe(true);vi.useRealTimers();
  });
  it('does not imply historical standings are reconstructed at the match date',()=>{
    const m={...match,header:{...match.header,publicId:'698c745b81534512',home:{...match.header.home,name:'Willem II'},away:{...match.header.away,name:'Fortuna Sittard'},competitionSlug:'eredivisie'}};
    expect(ctrMatchMetadata('br',m)?.intro).toContain('não é uma reconstrução');
    expect(ctrMatchMetadata('br',{...m,standings:{...m.standings,data:[]}})).toBeNull();
  });
  it('keeps distinct teams in selected team titles and does not rewrite other locales',()=>{
    expect(ctrTeamMetadata('br','02c2411f3e9941a7','Vila Nova')?.title).toBe('Vila Nova: jogos e resultados');
    expect(ctrTeamMetadata('br','e8daf455a06c4578','SC Freiburg')?.title).not.toContain('Vila Nova');
    expect(ctrTeamMetadata('en','02c2411f3e9941a7','Vila Nova')).toBeNull();
  });
  it('renders a short truthful module link without replacing the existing team H1',()=>{
    const html=renderToStaticMarkup(<MatchQueryIntro locale="mx" match={match}/>);
    expect(html).toContain('href="#lineups"');expect(html).toContain('partido finalizado');expect(html).not.toContain('<h1');
  });
  it('preserves existing route canonical, hreflang and decay decisions',()=>{
    const source=readFileSync('src/match-center/page.tsx','utf8');
    expect(source).toContain('const canonical = matchPath(locale, header.publicId, header.home.name, header.away.name)');
    expect(source).toContain('alternates: decayed ? { canonical }');
    expect(source).toContain('languageAlternates(br,mx,interfaceMatchPath');
  });
  it('keeps experiment reads behind the existing owner-session guard and exposes no public API',()=>{
    const source=readFileSync('src/app/owner/growth/seo/page.tsx','utf8');
    expect(source.indexOf('if(!requestOwnerSession(h))')).toBeLessThan(source.indexOf('const [search,experiments'));
    expect(source).toContain('index:false,follow:false');
    const html=renderToStaticMarkup(<SeoExperiments experiments={[]} opportunities={null}/>);
    expect(html).toContain('No registered metadata changes');expect(html).toContain('not automatic title edits');
  });
});
