import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {mutateFavorite,mergeFavorites,getFavorites,favoriteFeed} from './http';

vi.mock('server-only',()=>({}));

const userA={id:'11111111-1111-4111-8111-111111111111',email:'a@example.com',name:'A'};
const userB={id:'22222222-2222-4222-8222-222222222222',email:'b@example.com',name:'B'};
let current:typeof userA|null=null;

vi.mock('@/auth/session',()=>({currentUser:async()=>current}));

const favorites={teams:['0123456789abcdef'],competitions:[] as string[],fixtures:[] as string[]};
const mergeCalls:{userId:string;guest:unknown}[]=[];

vi.mock('./database',()=>({
  favoritesRepository:()=>({
    listPublic:async(userId:string)=>userId===userA.id?favorites:{teams:[],competitions:[],fixtures:[]},
    setFavorite:async(userId:string)=>userId===userA.id?{ok:true,favorited:true}:{ok:false,error:'INVALID'},
    mergePublic:async(userId:string,guest:unknown)=>{mergeCalls.push({userId,guest});return {favorites,skipped:0};},
    feed:async()=>[],
  }),
}));

function request(path:string,init?:RequestInit){
  const headers=new Headers(init?.headers);
  if(!headers.has('origin'))headers.set('origin','https://livasports.com');
  return new Request(`https://livasports.com${path}`,{...init,headers});
}

describe('favorites HTTP contract',()=>{
  it('never caches personalized favorites and ignores a client-supplied user_id',async()=>{
    current=userA;
    const response=await getFavorites();
    expect(response.headers.get('cache-control')).toContain('private');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({authenticated:true,teams:['0123456789abcdef'],providerRequests:0});
    const forbidden=await mutateFavorite(new Request('https://livasports.com/api/favorites',{method:'POST',headers:{origin:'https://evil.test','content-type':'application/json'},body:JSON.stringify({kind:'team',id:'0123456789abcdef',favorited:true})}));
    expect(forbidden.status).toBe(403);
    const invalid=await mutateFavorite(request('/api/favorites',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'team',id:'0123456789abcdef',favorited:true,userId:userB.id})}));
    expect(invalid.status).toBe(400);
  });

  it('keeps merge scoped to the session user and returns providerRequests 0',async()=>{
    current=userA;
    mergeCalls.length=0;
    const response=await mergeFavorites(request('/api/favorites/merge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:1,teams:['0123456789abcdef'],competitions:[],fixtures:[]})}));
    expect(response.status).toBe(200);
    expect(mergeCalls).toEqual([{userId:userA.id,guest:expect.objectContaining({teams:['0123456789abcdef']})}]);
    expect(await response.json()).toMatchObject({providerRequests:0,ok:true});
    current=null;
    expect((await mergeFavorites(request('/api/favorites/merge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:1,teams:[],competitions:[],fixtures:[]})}))).status).toBe(401);
  });

  it('serves a guest feed without provider calls',async()=>{
    current=null;
    const response=await favoriteFeed(request('/api/favorites/feed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({locale:'en',version:1,teams:['0123456789abcdef'],competitions:[],fixtures:[]})}));
    expect(await response.json()).toEqual({rows:[],providerRequests:0});
  });
});

describe('favorites cache and provider boundary',()=>{
  it('does not share user favorites through the public sports cache',()=>{
    const runtime=readFileSync('src/sports/runtime.ts','utf8');
    const http=readFileSync('src/favorites/http.ts','utf8');
    expect(runtime).not.toMatch(/favorite/);
    expect(readFileSync('src/favorites/origin.ts','utf8')).toContain("private, no-store");
    expect(http).not.toContain('NextServerCache');
    expect(http).toContain('providerRequests:0');
    expect(readFileSync('src/favorites/repository.ts','utf8')).not.toMatch(/Sportmonks|OddsPapi|fetch\(/);
  });
});
