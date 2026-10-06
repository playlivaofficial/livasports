import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {creativeFit} from '@/components/commercial/SponsoredCreative';
import {ONE_XBET_SITE_ID,embedDimensions,embedTrackingHost,oneXBetMediaId,safeBetssonEmbed,safeOneXBetIframe,safePublisherEmbed} from './embed-policy';
import {CREATIVE_ROLES,ROLE_PLACEMENTS,creativeAlt,inventoryCreative,inventoryDelivery,type CreativeRole} from './creative-inventory';
import {embedDocument} from './embed-document';
import {validCreative} from './policy';
import {parseCampaignConfiguration} from './configuration';
import {publicOffer,resolveOffer} from './service';
import {campaign,dependencies,key} from './fixtures.test-support';
import {isPublisherEmbed,type Creative} from './types';

// Synthetic token only. The real per-channel tag is private server-side configuration and is never
// written into a test, a fixture, a log or a report.
const TAG='SyntheticTag_000001';
const iframe=(over:{tag?:string;site?:string;ad?:string}={})=>'https://partners.1xbet.pe/I?'+new URLSearchParams(
  {tag:over.tag??TAG,site:over.site??ONE_XBET_SITE_ID,ad:over.ad??'178222'});
// A real publisher tag carries the media id twice: once as its own parameter and once inside the
// tracking redirect. The helper mirrors that so the agreement check is exercised, not bypassed.
const bannerflow=(media='208596',host='record.inkabet.pe')=>'https://c.bannerflow.net/a/'+'a'.repeat(24)+'?'+
  new URLSearchParams({display:'image',did:'b'.repeat(24),deeplink:'on',adgroupid:'c'.repeat(24),
    redirecturl:`https://${host}/synthetic-test-only/7?media=${media}`,media,campaign:'7'});

const creative=(over:Partial<Creative>={}):Creative=>({id:'1xbet-pe-home_top_banner-178222',locale:'pe',placement:'home_top_banner',
  enabled:true,approved:true,delivery:'ONE_XBET_IFRAME',embedSourceUrl:iframe(),imageUrl:null,imageAlt:creativeAlt('1xbet'),
  width:320,height:50,startsAt:null,endsAt:null,...over});
const peContext=(placement:Creative['placement']='home_top_banner')=>({locale:'pe' as const,pagePath:'/pe',placement});
const ok=(c:Creative,operator='1xbet',context=peContext(c.placement))=>validCreative(c,context,Date.now(),'7',operator);

describe('1xBet Peru partner-iframe contract',()=>{
  it('accepts exactly the approved host, path, parameters, site and media id',()=>{
    const s=iframe();
    expect(safeOneXBetIframe(s,'1xbet','pe')).toBe(s);
    expect(oneXBetMediaId(s,'1xbet','pe')).toBe('178222');
  });
  it('refuses any other host, including other 1xBet domains',()=>{
    for(const host of ['partners.1xbet.com','partners.1xbet.pe.evil.invalid','1xbet.pe','www.partners.1xbet.pe','affiliates.1xbet.pe'])
      expect(safeOneXBetIframe(iframe().replace('partners.1xbet.pe',host),'1xbet','pe')).toBeNull();
    expect(safeOneXBetIframe(iframe().replace('https://','http://'),'1xbet','pe')).toBeNull();
    expect(safeOneXBetIframe(iframe().replace('partners.1xbet.pe','partners.1xbet.pe:8443'),'1xbet','pe')).toBeNull();
  });
  it('refuses any other path',()=>{
    for(const path of ['/','/i','/I/','/I/extra','/Index','/II'])
      expect(safeOneXBetIframe(iframe().replace('/I?',path+'?'),'1xbet','pe')).toBeNull();
  });
  it('refuses an added, missing, duplicated or renamed query parameter',()=>{
    expect(safeOneXBetIframe(iframe()+'&extra=1','1xbet','pe')).toBeNull();
    expect(safeOneXBetIframe(iframe()+'&ad=178222','1xbet','pe')).toBeNull();
    expect(safeOneXBetIframe(iframe().replace(/&site=\d+/,''),'1xbet','pe')).toBeNull();
    expect(safeOneXBetIframe(iframe().replace('tag=','subid='),'1xbet','pe')).toBeNull();
    expect(safeOneXBetIframe(iframe()+'#fragment','1xbet','pe')).toBeNull();
  });
  it('refuses any site id but the verified LivaSports publisher id',()=>{
    for(const site of ['6175484','617548','0','']) expect(safeOneXBetIframe(iframe({site}),'1xbet','pe')).toBeNull();
  });
  it('refuses a media id that is not an approved Peru creative',()=>{
    // The 800x200 creative for the same promotion is deliberately not approved, and nor is anything else.
    for(const ad of ['178223','999999','17822','','178222x']) expect(safeOneXBetIframe(iframe({ad}),'1xbet','pe')).toBeNull();
  });
  it('refuses a tag that is not a plausible channel token',()=>{
    for(const tag of ['','short','x'.repeat(65),'has space','semi;colon','slash/es']) expect(safeOneXBetIframe(iframe({tag}),'1xbet','pe')).toBeNull();
  });
  it('is bound to 1xBet in Peru and to nothing else',()=>{
    for(const [operator,locale] of [['1xbet','br'],['1xbet','mx'],['1xbet','co'],['inkabet','pe'],['betsson','pe'],['betsson','mx'],['bwin','co']] as const)
      expect(safeOneXBetIframe(iframe(),operator,locale)).toBeNull();
  });
  it('gains no tracking host of ours, because the iframe carries its own tracking',()=>{
    expect(embedTrackingHost('1xbet','pe')).toBeNull();
    // And it is therefore not serviceable as a Bannerflow embed either.
    expect(safeBetssonEmbed(bannerflow(),'7','1xbet','pe')).toBeNull();
  });
});

describe('deliveries never substitute for one another',()=>{
  it('refuses a Bannerflow source as an iframe and an iframe as a Bannerflow source',()=>{
    expect(safePublisherEmbed('ONE_XBET_IFRAME',bannerflow(),'7','1xbet','pe')).toBeNull();
    expect(safePublisherEmbed('BETSSON_EMBED',iframe(),'7','inkabet','pe')).toBeNull();
    expect(safePublisherEmbed('BETSSON_EMBED',iframe(),'7','1xbet','pe')).toBeNull();
  });
  it('serves nothing for IMAGE or an unknown delivery',()=>{
    for(const delivery of ['IMAGE','BETSSON_IFRAME','ONE_XBET_EMBED','',null,undefined])
      expect(safePublisherEmbed(delivery,iframe(),'7','1xbet','pe')).toBeNull();
  });
  it('classifies only the two embed deliveries as publisher embeds',()=>{
    expect(isPublisherEmbed('BETSSON_EMBED')).toBe(true);
    expect(isPublisherEmbed('ONE_XBET_IFRAME')).toBe(true);
    for(const d of ['IMAGE','','ONE_XBET',null,undefined]) expect(isPublisherEmbed(d)).toBe(false);
  });
  it('keeps the Bannerflow path working exactly as before',()=>{
    const s=bannerflow();
    expect(safePublisherEmbed('BETSSON_EMBED',s,'7','inkabet','pe')).toBe(s);
    expect(safeBetssonEmbed(s,'7','inkabet','pe')).toBe(s);
  });
});

describe('the compact Peru top banner is admitted without widening the leaderboard sizes',()=>{
  it('allows 320x50 in a top slot for the iframe delivery only',()=>{
    expect(embedDimensions('home_top_banner',320,50,'ONE_XBET_IFRAME')).toBe(true);
    expect(embedDimensions('match_top_banner',320,50,'ONE_XBET_IFRAME')).toBe(true);
    expect(embedDimensions('home_top_banner',320,50,'BETSSON_EMBED')).toBe(false);
    expect(embedDimensions('home_top_banner',320,50)).toBe(false);
  });
  it('does not let the iframe delivery claim a leaderboard size',()=>{
    for(const [w,h] of [[970,90],[728,90],[320,100],[800,200]] as const)
      expect(embedDimensions('home_top_banner',w,h,'ONE_XBET_IFRAME')).toBe(false);
  });
  it('leaves every existing size rule untouched',()=>{
    expect(embedDimensions('home_top_banner',970,90)).toBe(true);
    expect(embedDimensions('home_top_banner',728,90)).toBe(true);
    expect(embedDimensions('match_right_rail',300,250)).toBe(true);
    expect(embedDimensions('mobile_inline',320,50)).toBe(true);
    expect(embedDimensions('mobile_inline',320,100)).toBe(true);
    expect(embedDimensions('match_right_rail',300,250,'ONE_XBET_IFRAME')).toBe(true);
  });
});

describe('approved inventory for the final MX/CO/PE commercial layout',()=>{
  const resolved=(operator:string,locale:string,role:CreativeRole,source:string)=>inventoryCreative(operator,locale,role,source);
  it('gives Peru its split: 1xBet the top banner and mobile slot, Inkabet the desktop right rail',()=>{
    expect(resolved('1xbet','pe','top',iframe())).toEqual({mediaId:'178222',width:320,height:50,delivery:'ONE_XBET_IFRAME'});
    expect(resolved('1xbet','pe','mobile',iframe())).toEqual({mediaId:'178222',width:320,height:50,delivery:'ONE_XBET_IFRAME'});
    // 1xBet publishes no right-rail size for this promotion, so that slot stays with Inkabet.
    expect(resolved('1xbet','pe','right',iframe())).toBeNull();
    expect(resolved('inkabet','pe','right',bannerflow())).toEqual({mediaId:'208596',width:300,height:250,delivery:'BETSSON_EMBED'});
  });
  it('no longer places the Inkabet top or mobile creatives, so neither can collide with 1xBet',()=>{
    expect(resolved('inkabet','pe','top',bannerflow('208590'))).toBeNull();
    expect(resolved('inkabet','pe','mobile',bannerflow('208595'))).toBeNull();
  });
  it('keeps the approved Mexico and Colombia media ids',()=>{
    const bf=(media:string,geo:string)=>bannerflow(media,`record.betsson.${geo}`);
    expect(resolved('betsson','mx','top',bf('207553','mx'))?.mediaId).toBe('207553');
    expect(resolved('betsson','mx','right',bf('207557','mx'))?.mediaId).toBe('207557');
    expect(resolved('betsson','mx','mobile',bf('207552','mx'))?.mediaId).toBe('207552');
    expect(resolved('betsson','co','top',bf('209366','co'))?.mediaId).toBe('209366');
    expect(resolved('betsson','co','right',bf('207980','co'))?.mediaId).toBe('207980');
    expect(resolved('betsson','co','mobile',bf('207978','co'))?.mediaId).toBe('207978');
  });
  it('records the delivery each platform actually generates',()=>{
    expect(inventoryDelivery('1xbet','pe')).toBe('ONE_XBET_IFRAME');
    for(const [operator,locale] of [['betsson','mx'],['betsson','co'],['inkabet','pe']] as const)
      expect(inventoryDelivery(operator,locale)).toBe('BETSSON_EMBED');
    // An operator with no affiliate access has no inventory and therefore no delivery.
    for(const [operator,locale] of [['bwin','co'],['1xbet','br'],['betsson','pe'],['inkabet','mx']] as const)
      expect(inventoryDelivery(operator,locale)).toBeNull();
  });
  it('refuses an approved Peru iframe offered for another operator or jurisdiction',()=>{
    for(const [operator,locale] of [['inkabet','pe'],['betsson','pe'],['1xbet','br'],['1xbet','mx'],['bwin','co']] as const)
      for(const role of CREATIVE_ROLES) expect(resolved(operator,locale,role,iframe())).toBeNull();
  });
  it('maps each role to the previously approved sponsor slots only',()=>{
    expect(ROLE_PLACEMENTS.top).toEqual(['home_top_banner','match_top_banner']);
    expect(ROLE_PLACEMENTS.right).toEqual(['home_right_rail','match_right_rail']);
    expect(ROLE_PLACEMENTS.mobile).toEqual(['mobile_inline']);
  });
  it('names 1xBet in the accessible description, with the responsible-gambling notice',()=>{
    expect(creativeAlt('1xbet')).toMatch(/^1xBet: apuestas deportivas\./);
    expect(creativeAlt('1xbet')).toContain('18');
    expect(creativeAlt('inkabet')).toMatch(/^Inkabet:/);
    expect(creativeAlt('betsson')).toMatch(/^Betsson:/);
  });
});

describe('read-time creative validation',()=>{
  it('accepts the approved PE top and mobile creatives',()=>{
    expect(ok(creative())).toBe(true);
    expect(ok(creative({id:'1xbet-pe-match_top_banner-178222',placement:'match_top_banner'}))).toBe(true);
    expect(ok(creative({id:'1xbet-pe-mobile_inline-178222',placement:'mobile_inline'}))).toBe(true);
  });
  it('refuses the same creative for another operator or jurisdiction',()=>{
    for(const operator of ['inkabet','betsson','bwin']) expect(ok(creative(),operator)).toBe(false);
    for(const locale of ['br','mx','co'] as const)
      expect(validCreative(creative({locale}),{locale,pagePath:'/'+locale,placement:'home_top_banner'},Date.now(),'7','1xbet')).toBe(false);
  });
  it('refuses an iframe creative that carries a local image, or an image creative that carries a source',()=>{
    expect(ok(creative({imageUrl:'/sponsors/1xbet/top-banner-970x90.webp'}))).toBe(false);
    expect(ok(creative({delivery:'IMAGE'}))).toBe(false);
  });
  it('refuses a stretched or otherwise resized creative',()=>{
    for(const [width,height] of [[970,90],[728,90],[800,200],[640,100],[320,51]] as const)
      expect(ok(creative({width,height}))).toBe(false);
  });
  it('still needs a campaign id, an operator and an in-window schedule',()=>{
    expect(validCreative(creative(),peContext(),Date.now(),undefined,'1xbet')).toBe(false);
    expect(validCreative(creative(),peContext(),Date.now(),'7',undefined)).toBe(false);
    expect(ok(creative({endsAt:new Date(Date.now()-1000).toISOString()}))).toBe(false);
    expect(ok(creative({startsAt:new Date(Date.now()+60000).toISOString()}))).toBe(false);
    expect(ok(creative({approved:false}))).toBe(false);
    expect(ok(creative({enabled:false}))).toBe(false);
  });
  it('refuses a creative whose placement does not match the slot being filled',()=>{
    expect(validCreative(creative({placement:'home_top_banner'}),peContext('mobile_inline'),Date.now(),'7','1xbet')).toBe(false);
  });
});

describe('approved campaign configuration',()=>{
  const config=(over:Record<string,unknown>={})=>({bookmaker:'1xbet',locale:'pe',operatorCampaignId:'7',
    destinationUrl:'https://record.inkabet.pe/synthetic-test-only/7',destinationType:'SPORTSBOOK',enabled:true,
    validFrom:'2026-01-01T00:00:00Z',validUntil:'2030-01-01T00:00:00Z',placements:['home_top_banner'],
    domains:['record.inkabet.pe'],approvalReference:'Synthetic test',
    creatives:[{id:'synthetic-1xbet-pe-top',placement:'home_top_banner',delivery:'ONE_XBET_IFRAME',embedSourceUrl:iframe(),
      imageAlt:creativeAlt('1xbet'),width:320,height:50,approvalReference:'Synthetic test'}],...over});
  it('refuses an iframe creative whose source is not an approved Peru creative',()=>{
    // The synthetic destination belongs to Inkabet, so this config can never be accepted for 1xBet;
    // what matters here is that an unapproved media id is refused before anything else is considered.
    expect(parseCampaignConfiguration(config({creatives:[{...config().creatives[0],embedSourceUrl:iframe({ad:'999999'})}]}))).toBeNull();
    expect(parseCampaignConfiguration(config({creatives:[{...config().creatives[0],embedSourceUrl:bannerflow()}]}))).toBeNull();
  });
  it('refuses an iframe creative declared for another jurisdiction',()=>{
    expect(parseCampaignConfiguration(config({locale:'mx'}))).toBeNull();
  });
});

describe('the sandboxed publisher document',()=>{
  const policy=(c:Creative)=>embedDocument(c,'https://livasports.com','bridge-key').headers.get('content-security-policy')!;
  it('widens frame-src to the single approved 1xBet origin and relaxes nothing else',async()=>{
    const p=policy(creative());
    expect(p).toContain('frame-src https://partners.1xbet.pe');
    expect(p).toContain("default-src 'none'");
    expect(p).toContain("object-src 'none'");
    expect(p).toContain("base-uri 'none'");
    expect(p).toContain("form-action 'none'");
    expect(p).toContain("frame-ancestors 'self'");
    expect(p).toContain("connect-src 'none'");
    expect(p).toContain("img-src 'none'");
    expect(p).toContain('sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox');
    // No eval, no script origin, no wildcard, no broad 1xBet domain.
    expect(p).not.toContain('unsafe-eval');
    expect(p).not.toContain('bannerflow');
    expect(p).not.toContain('*');
    expect(p).not.toContain('1xbet.com');
    expect(p).not.toContain('https://1xbet');
    // Exactly one 1xBet origin appears anywhere in the policy, and only as the frame-src value.
    expect(p.match(/partners\.1xbet\.pe/g)).toHaveLength(1);
    // Top-level navigation stays blocked: the commercial frame must open in a new context.
    expect(p).not.toContain('allow-top-navigation');
  });
  it('keeps the Bannerflow document framing nothing at all',()=>{
    const p=policy({...creative(),locale:'br',delivery:'BETSSON_EMBED',embedSourceUrl:bannerflow('123456','record.betsson.bet.br'),width:320,height:100,placement:'mobile_inline'});
    expect(p).toContain("frame-src 'none'");
    expect(p).not.toContain('partners.1xbet.pe');
  });
  it('nests the approved source at its native size and adds no click bridge',async()=>{
    const body=await embedDocument(creative(),'https://livasports.com','bridge-key').text();
    expect(body).toContain('src="https://partners.1xbet.pe/I?tag='+TAG);
    expect(body).toContain('width="320" height="50"');
    expect(body).toContain('sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"');
    expect(body).toContain("send('ready')");
    // A cross-origin frame owns its click-through, so no activation is ever synthesised here.
    expect(body).not.toContain("send('click')");
    expect(body).not.toContain('<script async');
    expect(body).toContain('lang="es"');
  });
  it('serves the document privately and unindexed',()=>{
    const r=embedDocument(creative(),'https://livasports.com','bridge-key');
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('the compact Peru top banner stays compact, centred and undistorted',()=>{
  // The embed box is styled width:320px with maxWidth:100%, so a slot wider than the creative leaves
  // the box at 320 and a narrower one shrinks it. creativeFit then only ever scales down.
  const boxWidth=(slot:number)=>Math.min(320,slot);
  it('never upscales at any of the QA breakpoints',()=>{
    // 1440 desktop: the top slot is up to 970 wide, far wider than the creative.
    for(const slot of [1440,970,728,430,390,320]) expect(creativeFit(boxWidth(slot),320).scale).toBeLessThanOrEqual(1);
    expect(creativeFit(boxWidth(1440),320)).toEqual({scale:1,offset:0});
    expect(creativeFit(boxWidth(430),320)).toEqual({scale:1,offset:0});
    expect(creativeFit(boxWidth(390),320)).toEqual({scale:1,offset:0});
  });
  it('scales down proportionally rather than cropping when the slot is narrower than 320',()=>{
    // A 320 viewport, less the 16px side gutters the layout keeps.
    const fit=creativeFit(288,320);
    expect(fit.scale).toBeCloseTo(0.9,5);
    expect(fit.offset).toBe(0);
    // A single uniform scale factor cannot distort the creative's 320:50 aspect ratio.
    expect(320/50).toBeCloseTo((320*fit.scale)/(50*fit.scale),5);
  });
  it('centres a creative narrower than its slot instead of stretching it',()=>{
    const css=readFileSync('src/app/visual-system.css','utf8');
    expect(css).toMatch(/\.sponsor-embed-box \{[^}]*margin-inline: auto/);
    // Nothing forces the box to fill a wider slot.
    expect(css).not.toMatch(/\.sponsor-embed-box \{[^}]*width: 100%/);
  });
});

describe('the private channel token never reaches a client',()=>{
  it('is absent from the public offer, its creative and its signed token',async()=>{
    const c=campaign();c.bookmaker='1xbet';c.locale='pe';c.operatorCampaignId='7';
    c.destination='https://record.inkabet.pe/synthetic-test-only/7';c.domains=['record.inkabet.pe'];c.operatorDomains=['record.inkabet.pe'];
    c.destinationType='SPORTSBOOK';c.placements=['home_top_banner'];c.creatives=[creative()];
    const offer=await resolveOffer(peContext(),dependencies(c));
    expect(offer).not.toBeNull();
    const value=publicOffer(offer!,key,Date.now(),'anonymous');
    const serialized=JSON.stringify(value);
    expect(serialized).not.toContain(TAG);
    expect(serialized).not.toContain('partners.1xbet.pe');
    expect(value.creative).toMatchObject({delivery:'ONE_XBET_IFRAME',width:320,height:50,imageUrl:null});
    // The delivery is published so the client knows to sandbox it, and consent is required for it.
    expect(value.embedPermission).toBe('anonymous');
  });
  it('requires a privacy permission before an iframe offer can be published at all',async()=>{
    const c=campaign();c.bookmaker='1xbet';c.locale='pe';c.operatorCampaignId='7';
    c.destination='https://record.inkabet.pe/synthetic-test-only/7';c.domains=['record.inkabet.pe'];c.operatorDomains=['record.inkabet.pe'];
    c.destinationType='SPORTSBOOK';c.placements=['home_top_banner'];c.creatives=[creative()];
    const offer=(await resolveOffer(peContext(),dependencies(c)))!;
    expect(()=>publicOffer(offer,key,Date.now())).toThrow('EMBED_PRIVACY_PERMISSION_REQUIRED');
  });
});
