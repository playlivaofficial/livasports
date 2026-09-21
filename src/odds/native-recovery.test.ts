import {describe,it,expect,vi,beforeEach} from 'vitest';
import type {DatabaseClient} from '@/database/client';
const state=vi.hoisted(()=>({persist:vi.fn(),diagnostics:vi.fn(),identities:[] as Array<{providerId:string;teamId:string}>}));
vi.mock('./ingestion',()=>({canonicalFixtures:async()=>[{id:'canonical',competitionId:'competition',competition:'league',sport:'FOOTBALL',homeId:'home',awayId:'away',home:'Canonical home',away:'Canonical away',kickoff:'2099-01-01T12:00:00Z',status:'SCHEDULED'}],persistSnapshot:state.persist}));
vi.mock('./identity',()=>({readTeamIdentities:async()=>state.identities}));
vi.mock('./native-diagnostics',()=>({persistNativeDiagnostics:state.diagnostics}));
import {recoverNativeIdentities} from './native-recovery';
const payload={bookmaker:'betboo.bet.br',observedAt:'2098-12-31T12:00:00Z',tournamentIds:['42'],quotes:[],rejected:{},fixtures:[{providerId:'provider',sport:'FOOTBALL',competition:'league',providerCompetitionId:'42',homeProviderId:'1',awayProviderId:'2',homeNames:['Variant home'],awayNames:['Variant away'],kickoff:'2099-01-01T12:00:00Z',status:'PREGAME'}]};
function database(){const query=vi.fn(async(sql:string)=>({rows:sql.includes('FROM odds_sync_snapshots s')?[{id:'saved',payload}]:sql.includes('SELECT provider_fixture_id')?[{provider_fixture_id:'provider'}]:[],rowCount:0}));return {query,db:{query} as unknown as DatabaseClient};}
beforeEach(()=>{vi.clearAllMocks();state.identities=[];});
describe('bounded permanent saved-response recovery',()=>{
  it('reuses confirmed identities without changing original timestamps or fetching a provider',async()=>{
    state.identities=[{providerId:'1',teamId:'home'},{providerId:'2',teamId:'away'}];const {db,query}=database();
    expect(await recoverNativeIdentities(db,'lease')).toEqual({repaired:1,providerRequests:0});
    expect(state.persist).toHaveBeenCalledWith(db,'lease',payload);
    expect(state.diagnostics).toHaveBeenCalled();
    expect(query.mock.calls.some(([sql])=>sql.includes('LIMIT 3'))).toBe(true);
    expect(query.mock.calls.some(([sql])=>sql.includes("'NATIVE_SAVED_REPAIR'"))).toBe(true);
  });
  it('records a rotation check without replaying an unresolved identity',async()=>{
    const {db,query}=database();expect(await recoverNativeIdentities(db,'lease')).toEqual({repaired:0,providerRequests:0});
    expect(state.persist).not.toHaveBeenCalled();expect(query.mock.calls.some(([sql])=>sql.includes('INSERT INTO odds_recovery_actions'))).toBe(true);
  });
});
