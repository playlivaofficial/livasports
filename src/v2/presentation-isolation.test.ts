import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {GET as presentation} from '@/app/api/presentation/route';
import {accessKeyHash,newOwnerSession,ownerCookie,signOwnerSession} from '@/owner/session';
import type {CoreGeo} from '@/config/geo';

const origin='https://livasports.com';
const access='presentation-test-access-'.repeat(3);
const secret='presentation-test-session-'.repeat(3);
function owner(geo:CoreGeo|null,expiresAt?:number){
  const session={...newOwnerSession(),preview:geo!==null,previewGeo:geo};
  return `${ownerCookie}=${signOwnerSession({...session,...(expiresAt===undefined?{}:{expiresAt})})}`;
}
function read(country:string,cookie=''){
  return presentation(new NextRequest(origin+'/api/presentation?geo=MX&locale=mx&owner_preview=PE',{
    headers:{'x-vercel-ip-country':country,cookie},
  }));
}
beforeEach(()=>{
  vi.stubEnv('VERCEL','1');vi.stubEnv('AFFILIATE_QA_GEO','');
  vi.stubEnv('OWNER_QA_ACCESS_HASH',accessKeyHash(access));vi.stubEnv('OWNER_QA_SESSION_SECRET',secret);
});
afterEach(()=>vi.unstubAllEnvs());

describe('private presentation response isolation',()=>{
  it('isolates interleaved Owner, anonymous and expired sessions without publishing credentials',async()=>{
    const mx=owner('MX'),co=owner('CO'),expired=owner('PE',Date.now()-1000);
    const responses=[read('GE',mx),read('GE'),read('GE',co),read('MX'),read('GE',expired),read('BR'),read('PE',owner(null))];
    const bodies=await Promise.all(responses.map(response=>response.json()));
    expect(bodies.map(body=>[body.productGeo,body.commercialLocale,body.owner.authorized,body.owner.preview])).toEqual([
      ['MX','mx',true,true],['ROW',null,false,false],['CO','co',true,true],['MX','mx',false,false],
      ['ROW',null,false,false],['ROW',null,false,false],['PE','pe',true,false],
    ]);
    for(const response of responses){
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('vary')).toBe('Cookie');
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      expect(response.headers.has('set-cookie')).toBe(false);
    }
    const json=JSON.stringify(bodies);
    for(const value of [access,secret,mx,co,expired,accessKeyHash(access)])expect(json).not.toContain(value);
  });

  it.each(['BR','US','GE','ES','PT','','XX'])('keeps %s closed despite public GEO and Owner inputs',async country=>{
    const response=read(country,'commercialGeo=MX; owner_preview=PE; livasports_language=mx; qa=1');
    expect(await response.json()).toMatchObject({productGeo:'ROW',commercialLocale:null,owner:{authorized:false,preview:false,previewGeo:null}});
  });

  it('rejects duplicated and modified Owner cookies without changing another response',async()=>{
    const cookie=owner('MX');
    for(const untrusted of [cookie+'; '+cookie,cookie.slice(0,-1)+(cookie.endsWith('A')?'B':'A')]){
      expect(await read('GE',untrusted).json()).toMatchObject({productGeo:'ROW',owner:{authorized:false}});
    }
    const privateResponse=read('GE',cookie);
    privateResponse.headers.set('cache-control','public');
    const anonymousResponse=read('GE');
    expect(anonymousResponse.headers.get('cache-control')).toBe('private, no-store');
    expect(await anonymousResponse.json()).toMatchObject({productGeo:'ROW',owner:{authorized:false}});
  });

  it('does not trust the edge-country header outside the trusted deployment environment',async()=>{
    vi.stubEnv('VERCEL','');
    for(const country of ['MX','CO','PE'])expect(await read(country).json()).toMatchObject({productGeo:'ROW',commercialLocale:null});
  });
});
