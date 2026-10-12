import {readFileSync,statSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {ENTAIN_CO_ZONES,affiliateTrackingHost,embedTrackingHost,entainZoneId,safeEntainIframe,safePublisherEmbed,trackingDestinationShapeValid} from './embed-policy';
import {creativeAlt,inventoryCreative} from './creative-inventory';
import {embedDocument} from './embed-document';
import {validCreative} from './policy';
import {publicOffer,resolveOffer} from './service';
import {campaign,dependencies,key} from './fixtures.test-support';
import {safeAffiliateDestination} from '@/odds/affiliate';
import {bookmakerConfig,ACTIVE_BOOKMAKER_IDS,VISIBLE_BOOKMAKERS} from '@/odds/registry';
import {normalizeM5Snapshot} from '@/providers/oddspapi/m5-normalizer';
import type {Campaign,CommercialContext,Creative,Placement} from './types';

/**
 * Mexico: Betsson + Winpot. Colombia: Betsson + bwin. Peru: unchanged. Everything below uses the real
 * collected identifiers (zone ids, media ids, hosts, provider slugs) and synthetic private tokens.
 */
const zone=(id:string)=>`https://mediaserver.entainpartners.com/renderBanner.do?zoneId=${id}&t=f&v=1&securedDomain=y`;
const WINPOT_TRACKER='https://record.affiliatesworld.com/_SyntheticWinpotToken0000/1/';
const BWIN_TRACKER='https://mediaserver.entainpartners.com/renderBanner.do?zoneId=2247632';
const ctx=(locale:'mx'|'co',placement:Placement):CommercialContext=>({locale,pagePath:'/'+locale,placement});

const bwinCreative=(over:Partial<Creative>={}):Creative=>({id:'bwin-co-home_right_rail-2247630',locale:'co',placement:'home_right_rail',enabled:true,approved:true,
  delivery:'ENTAIN_IFRAME',embedSourceUrl:zone('2247630'),imageUrl:null,imageAlt:creativeAlt('bwin'),width:300,height:250,startsAt:null,endsAt:null,...over});
const winpotCreative=(over:Partial<Creative>={}):Creative=>({id:'winpotmx-mx-home_right_rail-21',locale:'mx',placement:'home_right_rail',enabled:true,approved:true,
  delivery:'IMAGE',embedSourceUrl:null,imageUrl:'/sponsors/winpot/mx-sport-300x250.gif',imageAlt:creativeAlt('winpot.mx'),width:300,height:250,startsAt:null,endsAt:null,...over});

describe('the Entain Partners zone iframe contract (bwin Colombia)',()=>{
  it('accepts exactly the generated secure zone URL for the two approved zones',()=>{
    for(const id of ['2247630','2247631']){
      expect(safeEntainIframe(zone(id),'bwin','co')).toBe(zone(id));
      expect(entainZoneId(zone(id),'bwin','co')).toBe(id);
    }
    expect(ENTAIN_CO_ZONES).toEqual({'2247630':{width:300,height:250},'2247631':{width:320,height:50}});
  });
  it.each([
    ['another zone',zone('2247632')],
    ['the non-secure variant','http://mediaserver.entainpartners.com/renderBanner.do?zoneId=2247630&t=f&v=1&securedDomain='],
    ['an extra parameter',zone('2247630')+'&x=1'],
    ['reordered parameters','https://mediaserver.entainpartners.com/renderBanner.do?t=f&zoneId=2247630&v=1&securedDomain=y'],
    ['another host','https://mediaserver.entainpartners.com.evil.example/renderBanner.do?zoneId=2247630&t=f&v=1&securedDomain=y'],
    ['another path','https://mediaserver.entainpartners.com/trackAffiliateClick.do?zoneId=2247630&t=f&v=1&securedDomain=y'],
  ])('refuses %s',(_label,source)=>{
    expect(safeEntainIframe(source,'bwin','co')).toBeNull();
  });
  it('is bound to bwin in Colombia alone',()=>{
    for(const [operator,locale] of [['bwin','mx'],['bwin','pe'],['betsson','co'],['winpot.mx','mx'],['1xbet','pe']] as const)
      expect(safeEntainIframe(zone('2247630'),operator,locale)).toBeNull();
  });
  it('is validated only under its own delivery, never as a Bannerflow tag',()=>{
    expect(safePublisherEmbed('ENTAIN_IFRAME',zone('2247630'),'1148303','bwin','co')).toBe(zone('2247630'));
    expect(safePublisherEmbed('BETSSON_EMBED',zone('2247630'),'1148303','bwin','co')).toBeNull();
    expect(safePublisherEmbed('ONE_XBET_IFRAME',zone('2247630'),'1148303','bwin','co')).toBeNull();
  });
  it('serves only at the zone\'s native size',()=>{
    expect(validCreative(bwinCreative(),ctx('co','home_right_rail'),Date.now(),'1148303','bwin')).toBe(true);
    expect(validCreative(bwinCreative({width:300,height:600}),ctx('co','home_right_rail'),Date.now(),'1148303','bwin')).toBe(false);
    // The mobile zone cannot be served in the right rail, nor the right-rail zone on mobile.
    expect(validCreative(bwinCreative({embedSourceUrl:zone('2247631')}),ctx('co','home_right_rail'),Date.now(),'1148303','bwin')).toBe(false);
    expect(validCreative(bwinCreative({placement:'mobile_inline',embedSourceUrl:zone('2247631'),width:320,height:50}),ctx('co','mobile_inline'),Date.now(),'1148303','bwin')).toBe(true);
  });
  it('widens frame-src to the Entain origin only, with nothing else relaxed',()=>{
    const policy=embedDocument(bwinCreative(),'https://livasports.com','bridge-key').headers.get('content-security-policy')!;
    expect(policy).toContain('frame-src https://mediaserver.entainpartners.com');
    expect(policy).not.toContain('1xaff.pe');
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).toContain("img-src 'none'");
    expect(policy).toContain("connect-src 'none'");
  });
});

describe('outbound tracking hosts',()=>{
  it('admits each non-Bannerflow tracker for its own operator and jurisdiction only',()=>{
    expect(affiliateTrackingHost('bwin','co')).toBe('mediaserver.entainpartners.com');
    expect(affiliateTrackingHost('winpot.mx','mx')).toBe('record.affiliatesworld.com');
    for(const [operator,locale] of [['bwin','mx'],['winpot.mx','co'],['winpot.mx','pe'],['betsson','co'],['1xbet','pe'],['inkabet','pe']] as const){
      const host=affiliateTrackingHost(operator,locale);
      expect(host).not.toBe('mediaserver.entainpartners.com');
      expect(host).not.toBe('record.affiliatesworld.com');
    }
    // Neither is ever a Bannerflow redirect host.
    expect(embedTrackingHost('bwin','co')).toBeNull();
    expect(embedTrackingHost('winpot.mx','mx')).toBeNull();
  });
  it('pins each tracker to the link shape its panel generates',()=>{
    expect(trackingDestinationShapeValid('bwin','co',BWIN_TRACKER)).toBe(true);
    expect(trackingDestinationShapeValid('bwin','co',zone('2247630'))).toBe(false);
    expect(trackingDestinationShapeValid('winpot.mx','mx',WINPOT_TRACKER)).toBe(true);
    expect(trackingDestinationShapeValid('winpot.mx','mx','https://record.affiliatesworld.com/_SyntheticWinpotToken0000/2/')).toBe(false);
    expect(trackingDestinationShapeValid('winpot.mx','mx','https://record.affiliatesworld.com/_SyntheticWinpotToken0000/1/?sub=1')).toBe(false);
    // Operator domains themselves are untouched by the tracker rule.
    expect(trackingDestinationShapeValid('winpot.mx','mx','https://sport.winpot.mx/x')).toBe(true);
  });
  it('keeps Winpot\'s own domains in Mexico only',()=>{
    expect(safeAffiliateDestination('winpot.mx','mx','https://sport.winpot.mx/x')).toBe('https://sport.winpot.mx/x');
    expect(safeAffiliateDestination('winpot.mx','mx','https://record.affiliatesworld.com/_x/1/')).toBeNull();
    for(const locale of ['co','pe','br'] as const)expect(safeAffiliateDestination('winpot.mx',locale,'https://sport.winpot.mx/x')).toBeNull();
  });
});

describe('Winpot Mexico banner',()=>{
  it('is the official GIF, served unmodified from our own origin',()=>{
    const item=inventoryCreative('winpot.mx','mx','right','21')!;
    expect(item).toEqual({mediaId:'21',width:300,height:250,imageUrl:'/sponsors/winpot/mx-sport-300x250.gif',delivery:'IMAGE'});
    const bytes=readFileSync('public/sponsors/winpot/mx-sport-300x250.gif');
    expect(bytes.subarray(0,6).toString('latin1')).toBe('GIF89a');
    // Logical screen size from the GIF header: the native 300x250, never resized.
    expect([bytes.readUInt16LE(6),bytes.readUInt16LE(8)]).toEqual([300,250]);
    expect(statSync('public/sponsors/winpot/mx-sport-300x250.gif').size).toBeLessThan(300*1024);
    expect(validCreative(winpotCreative(),ctx('mx','home_right_rail'),Date.now(),'1','winpot.mx')).toBe(true);
  });
  it('is not a publisher embed, so no third-party script or frame ever loads for it',()=>{
    expect(validCreative(winpotCreative({embedSourceUrl:WINPOT_TRACKER}),ctx('mx','home_right_rail'),Date.now(),'1','winpot.mx')).toBe(false);
    expect(validCreative(winpotCreative({imageUrl:'https://media.affiliatesworld.com/uploads/Sport_banner_gif_300x250.gif'}),ctx('mx','home_right_rail'),Date.now(),'1','winpot.mx')).toBe(false);
  });
  it('has no role on the Mexico top banner or the mobile slot',()=>{
    expect(inventoryCreative('winpot.mx','mx','top','21')).toBeNull();
    expect(inventoryCreative('winpot.mx','mx','mobile','21')).toBeNull();
    for(const locale of ['co','pe','br'])expect(inventoryCreative('winpot.mx',locale,'right','21')).toBeNull();
  });
  it('carries no private token into the public offer',async()=>{
    const c:Campaign={...campaign(),bookmaker:'winpot.mx',locale:'mx',operatorCampaignId:'1',destination:WINPOT_TRACKER,destinationType:'SPORTSBOOK',
      domains:['record.affiliatesworld.com'],operatorDomains:['winpot.mx','www.winpot.mx','sport.winpot.mx','record.affiliatesworld.com'],
      placements:['home_right_rail'],creatives:[winpotCreative()]};
    const offer=await resolveOffer(ctx('mx','home_right_rail'),dependencies(c));
    expect(offer).not.toBeNull();
    const value=JSON.stringify(publicOffer(offer!,key,Date.now()));
    expect(value).not.toContain('SyntheticWinpotToken');
    expect(value).not.toContain('affiliatesworld');
    expect(value).toContain('/sponsors/winpot/mx-sport-300x250.gif');
  });
});

/**
 * The final layout per slot, resolved through the real arbitration. Desktop never shares a slot;
 * the one mobile slot rotates only between different operators that both hold a mobile creative.
 */
describe('final sponsor layout',()=>{
  const now=Date.now();
  const betssonMx=(placements:Placement[]):Campaign=>({...campaign(now),id:'11111111-1111-4111-8111-111111111111',bookmaker:'betsson',locale:'mx',operatorCampaignId:'1',
    destination:'https://record.betsson.mx/synthetic/1/',destinationType:'SPORTSBOOK',domains:['record.betsson.mx'],operatorDomains:['record.betsson.mx'],placements,
    creatives:placements.map(p=>({id:'b-'+p,locale:'mx',placement:p,enabled:true,approved:true,delivery:'IMAGE',embedSourceUrl:null,imageUrl:'/sponsors/betsson/x.webp',
      imageAlt:'Betsson',width:p==='mobile_inline'?320:p.includes('right')?300:970,height:p==='mobile_inline'?50:p.includes('right')?250:90,startsAt:null,endsAt:null}))});
  const winpot:Campaign={...campaign(now),id:'22222222-2222-4222-8222-222222222222',bookmaker:'winpot.mx',locale:'mx',operatorCampaignId:'1',destination:WINPOT_TRACKER,
    destinationType:'SPORTSBOOK',domains:['record.affiliatesworld.com'],operatorDomains:['record.affiliatesworld.com'],placements:['home_right_rail','match_right_rail'],
    creatives:[winpotCreative(),winpotCreative({id:'w-m',placement:'match_right_rail'})]};
  const deps=(...campaigns:Campaign[])=>({...dependencies(),campaigns:async()=>campaigns});

  it('gives Mexico desktop Betsson on top and Winpot on the right rail',async()=>{
    const both=deps(betssonMx(['home_top_banner','mobile_inline']),winpot);
    expect((await resolveOffer(ctx('mx','home_top_banner'),both,now))?.campaign.bookmaker).toBe('betsson');
    expect((await resolveOffer(ctx('mx','home_right_rail'),both,now))?.campaign.bookmaker).toBe('winpot.mx');
  });
  it('keeps Mexico mobile Betsson-only at every rotation step',async()=>{
    const both=deps(betssonMx(['home_top_banner','mobile_inline']),winpot);
    for(let step=0;step<6;step++)
      expect((await resolveOffer(ctx('mx','mobile_inline'),both,now+step*10*60000))?.campaign.bookmaker).toBe('betsson');
  });
  it('fails closed if a stale Betsson right-rail creative were ever left enabled beside Winpot',async()=>{
    // Migration 069 disables those rows; this pins why that step is required.
    const stale=deps(betssonMx(['home_top_banner','home_right_rail','mobile_inline']),winpot);
    expect(await resolveOffer(ctx('mx','home_right_rail'),stale,now)).toBeNull();
  });
});

describe('Winpot Mexico odds identity',()=>{
  it('is a visible Mexico-only book whose canonical id is the entitled provider id',()=>{
    const winpot=bookmakerConfig('winpot.mx')!;
    expect(winpot).toMatchObject({providerSlug:'winpot.mx',displayName:'Winpot',displayRole:'VISIBLE_PRIMARY',logoAsset:'/bookmakers/winpot.webp'});
    expect([...winpot.countries]).toEqual(['MX']);
    expect(ACTIVE_BOOKMAKER_IDS).toContain('winpot.mx');
    expect(VISIBLE_BOOKMAKERS.filter(b=>(b.countries as readonly string[]).includes('MX')).map(b=>b.canonicalId)).toEqual(['betsson','winpot.mx']);
    expect(VISIBLE_BOOKMAKERS.filter(b=>(b.countries as readonly string[]).includes('PE')).map(b=>b.canonicalId)).toEqual(['inkabet','1xbet']);
  });
  it('normalizes the live Liga MX response shape under its own name, never as Betsson or Lottoland',()=>{
    const price=(p:number)=>({players:{'0':{active:true,playerName:null,price:p,changedAt:'2026-10-12T01:37:51.108Z',bookmakerChangedAt:null,mainLine:true}}});
    const fixture={fixtureId:'id1002746472055228',sportId:10,tournamentId:27464,startTime:'2026-10-17T01:00:00.000Z',statusId:0,participant1Id:1944,participant2Id:1949,
      participant1Name:'Club Necaxa',participant2Name:'Atlas FC',bookmakerOdds:{'winpot.mx':{bookmakerIsActive:true,suspended:false,
        fixturePath:'https://www.lottoland.com/global/sportsbook?eventId=17668767',
        markets:{'101':{marketActive:true,outcomes:{'101':price(2.455),'102':price(3.4),'103':price(2.571)}}}}}};
    const snapshot=normalizeM5Snapshot([fixture],'winpot.mx','2026-10-12T02:00:00.000Z',['27464'],undefined,[],'winpot.mx');
    expect(snapshot.bookmaker).toBe('winpot.mx');
    expect(snapshot.quotes.length).toBeGreaterThan(0);
    expect(snapshot.quotes.every(q=>q.bookmaker==='winpot.mx')).toBe(true);
    expect(snapshot.quotes.map(q=>Number(q.decimalOdds)).sort()).toEqual([2.455,2.571,3.4]);
  });
});

describe('migration 069',()=>{
  const sql=readFileSync('db/migrations/069_mx_winpot_co_bwin_commercial.sql','utf8');
  it('maps the exact entitled provider id and leaves Winpot commercially fail-closed',()=>{
    expect(sql).toContain("'ODDSPAPI','winpot.mx'");
    expect(sql).toMatch(/false,'CANDIDATE','VERIFIED'/);
    expect(sql).toContain("RAISE EXCEPTION 'MX_ODDS_POOL_UNEXPECTED");
    expect(sql).toContain("RAISE EXCEPTION 'WINPOT_MUST_STAY_MX_AND_FAIL_CLOSED");
  });
  it('pins the Entain delivery to Colombia and leaves Peru untouched',()=>{
    expect(sql).toContain("delivery_type='ENTAIN_IFRAME' AND locale='co'");
    expect(sql).toContain("RAISE EXCEPTION 'PE_ODDS_POOL_UNEXPECTED");
    // Nothing in the migration writes a Peruvian row.
    expect(sql).not.toMatch(/iso2\s*=\s*'PE'[^;]*\b(SET|INSERT)/i);
    expect(sql).not.toMatch(/UPDATE[^;]*'PE'/i);
  });
  it('disables only Betsson\'s Mexico and Colombia right-rail creatives',()=>{
    expect(sql).toMatch(/UPDATE profile_sponsor_campaigns s SET enabled=false[\s\S]*b\.provider_slug='betsson' AND c\.iso2 IN \('MX','CO'\)[\s\S]*s\.placement IN \('home_right_rail','match_right_rail'\)/);
  });
  it('writes no private token',()=>{
    expect(sql).not.toMatch(/record\.affiliatesworld\.com\/_/);
    expect(sql).not.toMatch(/wm=\d/);
  });
});
