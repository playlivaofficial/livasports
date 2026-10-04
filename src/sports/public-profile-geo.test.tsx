import {beforeEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {FixtureStatus} from '@/domain/enums';
import type {MatchHistoryView} from '@/match-center/types';
import type {SquadContext} from '@/profiles/types';
import type {PendingSportsFixture} from './types';

vi.mock('server-only',()=>({}));
vi.mock('next/navigation',()=>({usePathname:()=>'/co/equipo/club-0123456789abcdef'}));
vi.mock('@/components/sports/SiteHeader',()=>({SiteHeader:()=>null}));
vi.mock('@/localization/time-zone-server',()=>({requestTimeZone:vi.fn(async()=>{throw new Error('PRIVATE_REQUEST_READ');})}));
import {requestTimeZone} from '@/localization/time-zone-server';
import {MatchHistory} from './MatchHistory';
import {PendingMatch,pendingMetadata} from './PendingMatch';
import {SquadBrowser} from './SquadBrowser';

const history:MatchHistoryView={id:'match',publicId:'0123456789abcdef',kickoff:'2026-10-02T04:30:00Z',home:'Club Local',away:'Club Visitante',homeScore:2,awayScore:1,status:FixtureStatus.FINISHED,perspective:'W'};
const pending:PendingSportsFixture={publicId:history.publicId,kickoff:history.kickoff,round:null,stage:null,competitionSlug:'liga-mx',seasonId:'11111111-1111-4111-8111-111111111111',season:'2026',home:null,away:null};
const contexts:SquadContext[]=[{competition:'League',season:'2026',seasonId:pending.seasonId,players:[{id:'player',publicId:'2222222222222222',name:'Jugador Uno',imageUrl:null,nationality:null,countryCode:null,positionId:27,position:'Attacker',jerseyNumber:9}]}];
beforeEach(()=>vi.clearAllMocks());

describe('cache-safe public sports components retain all core GEOs',()=>{
  it.each(['mx','co','pe'] as const)('%s history keeps Spanish form labels and canonical match links without private request reads',async locale=>{
    const html=renderToStaticMarkup(await MatchHistory({title:'Forma',rows:[history],locale}));
    expect(html).toContain('>G</span>');expect(html).toContain('aria-label="Victoria"');
    expect(html).toContain(`/${locale}/partido/club-local-x-club-visitante-${history.publicId}`);
    expect(html).toContain(`>${locale==='mx'?'01/10/26':'1/10/26'}</time>`);expect(requestTimeZone).not.toHaveBeenCalled();
  });
  it.each(['mx','co','pe'] as const)('%s pending fixture shell uses its deterministic local day and Spanish copy',async locale=>{
    const html=renderToStaticMarkup(await PendingMatch({locale,row:pending}));
    expect(html).toContain('Equipos por definir');expect(html).toContain('1 de octubre de 2026');
    expect(html).toContain(`/${locale}/futbol?competition=liga-mx`);expect(requestTimeZone).not.toHaveBeenCalled();
    expect(pendingMetadata(locale,pending).alternates?.canonical).toBe(`/${locale}/partido/fixture-x-pending-${pending.publicId}`);
  });
  it.each(['mx','co','pe'] as const)('%s squad default remains crawlable with Spanish labels and local player links',locale=>{
    const html=renderToStaticMarkup(<SquadBrowser locale={locale} contexts={contexts}/>);
    expect(html).toContain('Plantilla por temporada');expect(html).toContain('Delanteros');
    expect(html).toContain(`/${locale}/jugador/jugador-uno-2222222222222222`);
    expect(requestTimeZone).not.toHaveBeenCalled();
  });
});
