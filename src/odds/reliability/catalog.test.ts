import {describe,it,expect,vi} from 'vitest';
import {classifyCatalogRows,persistCatalogRows} from './catalog';
import type {QueryExecutor} from '@/database/client';

const rows=[
  {tournamentId:325,tournamentSlug:'brasileiro-serie-a',categorySlug:'brazil',categoryName:'Brazil',tournamentName:'Brasileiro Série A',futureFixtures:20},
  {tournamentId:4242,tournamentSlug:'laliga2',categorySlug:'spain',categoryName:'Spain',tournamentName:'LaLiga 2',futureFixtures:11},
  {tournamentId:4343,tournamentSlug:'uefa-conference-league',categorySlug:'international-clubs',categoryName:'International Clubs',tournamentName:'UEFA Conference League',futureFixtures:18},
  {tournamentId:7777,tournamentSlug:'spain-cup-b',categorySlug:'spain',categoryName:'Spain',tournamentName:'Copa Federación',futureFixtures:3},
  {tournamentId:9999,tournamentSlug:'j1-league',categorySlug:'japan',categoryName:'Japan',tournamentName:'J1 League'},
  {tournamentId:8888,tournamentSlug:'primera-b-nacional',categorySlug:'argentina',categoryName:'Argentina',tournamentName:'Primera Nacional',futureFixtures:9},
  {tournamentId:'bad',tournamentSlug:'broken',categorySlug:'spain'},
];
describe('P3 catalog self-healing (§11, §30)',()=>{
  const states=Object.fromEntries(classifyCatalogRows(rows).map(r=>[r.tournamentId,r]));
  it('known slug rule maps; lookupName alias maps with the provider ID copied; unique normalized name maps',()=>{
    expect(states['325']).toMatchObject({state:'MAPPED',competition:'brasileirao-serie-a'});
    expect(states['4242']).toMatchObject({state:'MAPPED',competition:'la-liga-2'});
    expect(states['4343']).toMatchObject({state:'MAPPED',competition:'conference-league'});
  });
  it('unknown rows persist as UNMATCHED inside registry categories and IGNORED_WITH_REASON outside them; malformed rows are dropped',()=>{
    expect(states['7777']).toMatchObject({state:'UNMATCHED'});
    expect(states['8888']).toMatchObject({state:'UNMATCHED'});
    expect(states['9999']).toMatchObject({state:'IGNORED_WITH_REASON'});
    expect(states['bad']).toBeUndefined();
  });
  it('ambiguous names stay AMBIGUOUS and never auto-map',()=>{
    const twins=[...rows,{tournamentId:4545,tournamentSlug:'laliga-2-b',categorySlug:'spain',categoryName:'Spain',tournamentName:'La Liga 2'}];
    const s=Object.fromEntries(classifyCatalogRows(twins).map(r=>[r.tournamentId,r]));
    expect(s['4242'].state).toBe('AMBIGUOUS');expect(s['4545'].state).toBe('AMBIGUOUS');
    expect(classifyCatalogRows(twins).some(r=>r.state==='MAPPED'&&r.competition==='la-liga-2')).toBe(false);
  });
  it('a later resolvable row auto-recovers once the twin disappears (no wrong competition mapping in between)',()=>{
    const later=rows.filter(r=>r.tournamentId!==4545);
    expect(classifyCatalogRows(later).find(r=>r.tournamentId==='4242')).toMatchObject({state:'MAPPED',competition:'la-liga-2'});
    expect(classifyCatalogRows(later).find(r=>r.competition==='la-liga-2'&&r.tournamentId!=='4242')).toBeUndefined();
  });
  it('persists rows with first/last seen and mapping state (upsert keeps first_seen_at)',async()=>{
    const query=vi.fn(async()=>({rows:[],rowCount:0}));
    const summary=await persistCatalogRows({query:query as unknown as QueryExecutor['query']},rows);
    expect(summary).toEqual({total:6,mapped:3,unmatched:2,ambiguous:0});
    const sql=String((query.mock.calls as unknown as string[][])[0][0]);
    expect(sql).toContain('INSERT INTO odds_catalog_rows');expect(sql).toContain('last_seen_at=now()');expect(sql).not.toContain('first_seen_at=');
  });
});
