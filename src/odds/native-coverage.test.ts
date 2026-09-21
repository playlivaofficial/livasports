import {describe,it,expect} from 'vitest';
import {nativeReason,nativeRegressions,summarizeNative,returnedQuoteLost,confirmedProviderGap,type NativeCell} from './native-coverage';
import {snapshotDiagnostics} from './native-diagnostics';
import {matchOddsFixture,matchOddsSnapshot,normalizeTeamName} from './matching';
import type {CanonicalOddsFixture,ProviderOddsFixture,OddsSnapshot,ReadOddsQuote} from './types';
const f:CanonicalOddsFixture={id:'f',competitionId:'c',competition:'test-league',sport:'FOOTBALL',home:'Canonical Home',away:'Canonical Away',homeId:'h',awayId:'a',kickoff:'2026-10-01T12:00:00Z',status:'SCHEDULED'};
const raw:ProviderOddsFixture={providerId:'new',sport:'FOOTBALL',competition:f.competition,providerCompetitionId:'42',kickoff:f.kickoff,status:'PREGAME',homeProviderId:'1',awayProviderId:'2',homeNames:['Different Home'],awayNames:['Different Away']};
describe('durable native identity',()=>{
  const identities=[{providerId:'1',teamId:'h'},{providerId:'2',teamId:'a'}];
  it('reuses confirmed provider teams on future fixture IDs and future seasons',()=>{
    expect(matchOddsFixture(raw,[f],[],identities).fixture?.id).toBe('f');
    const future={...f,id:'future',kickoff:'2027-10-01T12:00:00Z'};
    expect(matchOddsFixture({...raw,providerId:'future-provider',kickoff:future.kickoff},[future],[],identities).fixture?.id).toBe('future');
  });
  it('reuses persistent contextual aliases without code changes',()=>{
    const aliases=[{competitionId:'c',normalizedName:'different home',teamId:'h'},{competitionId:'c',normalizedName:'different away',teamId:'a'}];
    expect(matchOddsFixture(raw,[f],[],aliases).fixture?.id).toBe('f');
    expect(matchOddsFixture(raw,[f],[],[...aliases,{competitionId:'c',normalizedName:'different home',teamId:'wrong'}]).fixture).toBeNull();
  });
  it('rejects reversed roles, wrong competition, wrong time and conflicting identity',()=>{
    for(const altered of [{...raw,homeProviderId:'2',awayProviderId:'1'},{...raw,competition:'other'},{...raw,kickoff:'2026-10-01T16:00:00Z'}])expect(matchOddsFixture(altered,[f],[],identities).fixture).toBeNull();
    expect(matchOddsFixture(raw,[f],[],[...identities,{providerId:'1',teamId:'wrong'}]).fixture).toBeNull();
  });
  it('normalizes accents/punctuation/spacing without guessing abbreviations',()=>{
    expect(normalizeTeamName('  AtléTico --  GO ')).toBe('atletico go');
    expect(matchOddsFixture(raw,[f],[],[]).fixture).toBeNull();
  });
  it('rejects multiple provider events claiming one fixture in audit and recovery too',()=>{
    expect(matchOddsSnapshot([raw,{...raw,providerId:'another'}],[f],[],identities).every(m=>!m.fixture&&m.state==='AMBIGUOUS')).toBe(true);
  });
});
describe('native diagnostics and rolling baselines',()=>{
  it('retains latest confirmed provider omissions after quote freshness expires without trusting superseded or ambiguous evidence',()=>{
    const at='2026-09-21T04:40:10.055Z';
    const rows=[{fixture_id:'f',outcome:'YES',classification:'PROVIDER_GAP',observed_at:at}];
    expect(confirmedProviderGap(rows,'f','YES',at)).toBe(true);
    expect(confirmedProviderGap(rows,'f','YES','2026-09-21T10:00:00Z')).toBe(false);
    expect(confirmedProviderGap(rows,'other','YES',at)).toBe(false);
    expect(confirmedProviderGap(rows,'f','NO',at)).toBe(false);
    expect(confirmedProviderGap(rows,'f','YES',undefined)).toBe(false);
  });
  const snapshot:OddsSnapshot={bookmaker:'betboo.bet.br',observedAt:'2026-10-01T11:55:00Z',fixtures:[raw],quotes:[],tournamentIds:['42'],rejected:{}};
  it('explains every supported selection and retains identity evidence',()=>{
    const rows=snapshotDiagnostics(snapshot,[{raw,fixture:null,state:'TEAM_MISMATCH',reason:'Unresolved',candidateFixtureIds:['f']}]);
    expect(rows).toHaveLength(7);expect(rows.every(r=>r.classification==='IDENTITY_UNRESOLVED')).toBe(true);
    expect(rows[0].evidence).toMatchObject({candidates:['f'],home:raw.homeNames,kickoff:raw.kickoff});
    expect(snapshotDiagnostics(snapshot,[{raw,fixture:f,state:'EXACT',reason:'Matched'}]).every(r=>r.classification==='PROVIDER_GAP')).toBe(true);
  });
  it('distinguishes a normalization rejection from a genuine provider gap',()=>{
    const s={...snapshot,diagnostics:[{providerFixtureId:'new',tournamentId:'42',market:'MATCH_WINNER',outcome:'HOME',reason:'INVALID_DECIMAL_ODDS',evidence:{}}]};
    expect(snapshotDiagnostics(s,[{raw,fixture:f,state:'EXACT',reason:'Matched'}])[0].classification).toBe('MARKET_MAPPING_FAILURE');
  });
  it.each([
    [{returned:true},'INGESTION_BUG'],[{unresolved:true},'IDENTITY_UNRESOLVED'],[{rejected:true},'MARKET_MAPPING_FAILURE'],
    [{delayed:true},'QUOTA_OR_BACKOFF_DELAY'],[{providerGap:true},'PROVIDER_GAP'],[{},'UNKNOWN_PIPELINE_DEFECT'],
  ] as const)('does not disguise missing evidence as provider support: %j', (flags,reason)=>{
    expect(nativeReason({snapshot:{kickoff:f.kickoff,fixtureStatus:'SCHEDULED',quotes:[]},now:Date.parse(snapshot.observedAt),returned:false,rejected:false,unresolved:false,delayed:false,providerGap:false,...flags})).toBe(reason);
  });
  it('detects real cohort regression but not permanently unsupported cohorts or insufficient history',()=>{
    const cells:NativeCell[]=Array.from({length:5},(_,n)=>({fixtureId:String(n),competition:'league',bookmaker:'betboo.bet.br',market:'MATCH_WINNER',outcome:'HOME',window:'2-24h',kind:'REAL',reason:null,source:'betboo.bet.br'}));
    const baseline=summarizeNative(cells),current=summarizeNative(cells.map(c=>({...c,kind:'PROXY',reason:'PROVIDER_GAP'})));
    expect(nativeRegressions(current,[{groups:baseline},{groups:baseline},{groups:baseline}])).toHaveLength(1);
    expect(nativeRegressions(current,[{groups:baseline}])).toEqual([]);
    expect(nativeRegressions(current,[{groups:current},{groups:current},{groups:current}])).toEqual([]);
  });
  it('does not hide a newly returned lost quote behind an older expired stored quote',()=>{
    const quote={observedAt:'2026-10-01T09:00:00Z',status:'STALE'} as ReadOddsQuote;
    expect(nativeReason({quote,snapshot:{quotes:[quote],kickoff:f.kickoff,fixtureStatus:'SCHEDULED'},now:Date.parse(snapshot.observedAt),returned:true,returnedAt:snapshot.observedAt,rejected:false,unresolved:false,delayed:false,providerGap:false})).toBe('INGESTION_BUG');
  });
  it('detects a lost update even when an older native price can still be shown',()=>{
    const stored={observedAt:'2026-10-01T11:50:00Z',status:'ACTIVE',decimalOdds:'2.0'} as ReadOddsQuote;
    const returned={...stored,observedAt:snapshot.observedAt,decimalOdds:'2.1'};
    expect(returnedQuoteLost(returned,stored,true)).toBe(true);
    expect(returnedQuoteLost(returned,{...stored,observedAt:returned.observedAt},true)).toBe(true);
    expect(returnedQuoteLost(returned,{...stored,...returned},true)).toBe(false);
    expect(returnedQuoteLost(returned,undefined,false)).toBe(false);
  });
  it('alerts on an unresolved mapping spike against the same cohort baseline',()=>{
    const cells:NativeCell[]=Array.from({length:9},(_,n)=>({fixtureId:String(n),competition:'league',bookmaker:'betboo.bet.br',market:'MATCH_WINNER',outcome:'HOME',window:'2-24h',kind:'REAL',reason:null,source:'betboo.bet.br'}));
    const baseline=summarizeNative(cells),current=summarizeNative(cells.map(c=>({...c,kind:'UNAVAILABLE',reason:'IDENTITY_UNRESOLVED'})));
    expect(nativeRegressions(current,Array(3).fill({groups:baseline}))[0].reason).toBe('UNRESOLVED_IDENTITY_REGRESSION');
  });
});
