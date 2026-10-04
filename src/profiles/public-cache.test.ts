import {readFileSync} from 'node:fs';
import {describe,expect,it,vi,beforeEach} from 'vitest';
import {NextRequest} from 'next/server';
import {teamHistoryKey,teamHistorySelection,type TeamHistoryProfile} from './history-policy';

vi.mock('server-only',()=>({}));
vi.mock('@/profiles/runtime',()=>({loadTeamProfile:vi.fn()}));
vi.mock('@/sports/runtime',()=>({loadTeamHistory:vi.fn()}));
vi.mock('@/security/request-limit',()=>({requestLimit:vi.fn(async()=>null)}));
import {GET} from '@/app/api/profiles/team-history/route';
import {loadTeamProfile} from './runtime';
import {loadTeamHistory} from '@/sports/runtime';
import {requestLimit} from '@/security/request-limit';

const season='11111111-1111-4111-8111-111111111111';
const profile:TeamHistoryProfile={publicId:'0123456789abcdef',name:'Team',competitions:[{seasonId:season}] as TeamHistoryProfile['competitions']};
const request=(query='')=>new NextRequest(`https://livasports.com/api/profiles/team-history?id=${profile.publicId}&locale=mx${query}`);
beforeEach(()=>{vi.clearAllMocks();vi.mocked(loadTeamProfile).mockResolvedValue({kind:'found',profile} as never);vi.mocked(loadTeamHistory).mockResolvedValue({rows:[],hasNext:false});vi.mocked(requestLimit).mockResolvedValue(null);});

describe('public profile ISR policy',()=>{
  it.each([['br/time',3600],['mx/equipo',3600],['en/team',3600],['br/jogador',21600],['mx/jugador',21600],['en/player',21600]])('%s has on-demand path-keyed ISR', (route,ttl)=>{
    const source=readFileSync(`src/app/${route}/[profile]/page.tsx`,'utf8');
    expect(source).toContain(`export const revalidate = ${ttl}`);expect(source).toContain('generateStaticParams(){return [];}');
    expect(source).not.toContain('force-dynamic');expect(source).not.toContain('force-static');
  });
  it('profile shells do not read cookies or request query state',()=>{
    const route=readFileSync('src/profiles/page.tsx','utf8');
    expect(route).not.toContain('connection(');expect(route).not.toContain('await searchParams');
    for(const path of ['src/components/profile/ProfilePage.tsx','src/localization/EnglishProfiles.tsx']){
      const source=readFileSync(path,'utf8');expect(source).not.toContain('requestTimeZone');expect(source).toContain('LocalizedTimeText');
    }
  });
  it('bounds history queries and permits only real seasons belonging to this team',()=>{
    expect(teamHistorySelection(profile,new URLSearchParams(`matches=fixtures&p=9999&season=${season}`))).toEqual({view:'fixtures',page:1000,season});
    expect(teamHistorySelection(profile,new URLSearchParams('matches=arbitrary&p=-1&season=22222222-2222-4222-8222-222222222222'))).toEqual({view:'results',page:1});
    expect(teamHistoryKey(teamHistorySelection(profile,new URLSearchParams()))).toBe('results:1:all');
  });
});

describe('read-only public team history island',()=>{
  it('returns public cacheable sports facts in the explicit URL locale, regardless of cookies or IP GEO',async()=>{
    const req=request(`&matches=fixtures&p=2&season=${season}`);req.headers.set('cookie','owner_preview=BR');req.headers.set('x-vercel-ip-country','PE');
    const response=await GET(req);
    expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('s-maxage=300');expect(response.headers.has('set-cookie')).toBe(false);
    expect(loadTeamHistory).toHaveBeenCalledWith(profile.publicId,'mx','fixtures',2,season);
    expect(await response.json()).toEqual({rows:[],hasNext:false});
  });
  it.each(['&locale=br','&extra=cachebuster','&p=1&p=2'])('rejects duplicate or arbitrary query keys %s before database work',async query=>{
    expect((await GET(request(query))).status).toBe(400);expect(loadTeamProfile).not.toHaveBeenCalled();expect(requestLimit).not.toHaveBeenCalled();
  });
  it('uses the existing read limiter on cache misses, without weakening its fail-closed result',async()=>{
    vi.mocked(requestLimit).mockResolvedValue(Response.json({error:'RATE_LIMITED'},{status:429,headers:{'Cache-Control':'private, no-store'}}));
    const response=await GET(request());expect(response.status).toBe(429);expect(response.headers.get('cache-control')).toContain('no-store');expect(loadTeamProfile).not.toHaveBeenCalled();
  });
  it('does not cache failures or misreport an unavailable database as a missing profile',async()=>{
    vi.mocked(loadTeamProfile).mockRejectedValue(new Error('private database error'));
    const response=await GET(request());expect(response.status).toBe(503);expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.text()).not.toContain('private');
  });
});
