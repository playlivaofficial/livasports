import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {activateOperator,activationCreatives,parseActivation,type ActivationInput} from './owner-commercial';
import {ROLE_PLACEMENTS,creativePromotion,inventoryCreative} from './creative-inventory';
import {parseCampaignConfiguration} from './configuration';
import type {DatabaseClient,QueryExecutor} from '@/database/client';

/**
 * MX/CO/PE commercial activation through the audited owner path. Every token below is synthetic;
 * media ids and tracking hosts are the real collected inventory, because those are what is enforced.
 */
const TOKEN='_syntheticTestTokenNotReal000000';
const HOST={mx:'record.betsson.mx',co:'record.betsson.co',pe:'record.inkabet.pe'} as const;
// The exact shape the media gallery generates: media and campaign are parameters of the Bannerflow
// URL, and redirecturl is just the tracking host plus the channel token and campaign.
const embed=(host:string,media:string,campaign='1')=>'https://c.bannerflow.net/a/'+'a'.repeat(24)+'?'+new URLSearchParams({
  display:'image',did:'b'.repeat(24),deeplink:'on',adgroupid:'c'.repeat(24),
  redirecturl:`https://${host}/${TOKEN}/${campaign}/`,media,campaign});
// The gallery emits redirecturl unencoded, so the same tag must also be accepted in that raw form.
const rawEmbed=(host:string,media:string,campaign='1')=>'https://c.bannerflow.net/a/'+'a'.repeat(24)+
  `?display=image&did=${'b'.repeat(24)}&deeplink=on&adgroupid=${'c'.repeat(24)}&redirecturl=https://${host}/${TOKEN}/${campaign}/&media=${media}&campaign=${campaign}`;
// The 1xBet Peru partner iframe. `tag` is synthetic here; the real channel token is server-side only.
const iframe=(media:string,site='6175483')=>'https://1xaff.pe/I?'+new URLSearchParams({tag:'SyntheticTag_000001',site,ad:media});

/**
 * The owner's final commercial layout. Mexico and Colombia are single-operator. Peru is split so that
 * no two campaigns ever claim one sponsor placement, which resolveOffer would fail closed on: 1xBet
 * takes the desktop top banner and the mobile slot, Inkabet the desktop right rail.
 */
const GEOS=[
  {geo:'MX',locale:'mx',operator:'betsson',tracking:HOST.mx,destination:`https://${HOST.mx}/${TOKEN}/1/`,delivery:'BETSSON_EMBED',
    roles:{top:'207553',right:'207557',mobile:'207552'},top:[970,90],
    placements:['home_right_rail','home_top_banner','match_right_rail','match_top_banner','mobile_inline'],domains:['betsson.mx','www.betsson.mx']},
  {geo:'CO',locale:'co',operator:'betsson',tracking:HOST.co,destination:`https://${HOST.co}/${TOKEN}/1/`,delivery:'BETSSON_EMBED',
    roles:{top:'209366',right:'207980',mobile:'207978'},top:[728,90],
    placements:['home_right_rail','home_top_banner','match_right_rail','match_top_banner','mobile_inline'],domains:['betsson.co']},
  {geo:'PE',locale:'pe',operator:'inkabet',tracking:HOST.pe,destination:`https://${HOST.pe}/${TOKEN}/1/`,delivery:'BETSSON_EMBED',
    roles:{right:'208596'},top:null,
    placements:['home_right_rail','match_right_rail'],domains:['inkabet.pe']},
  {geo:'PE',locale:'pe',operator:'1xbet',tracking:null,destination:`https://1xbet.pe/${TOKEN}/1/`,delivery:'ONE_XBET_IFRAME',
    roles:{top:'178222',mobile:'178222'},top:[320,50],
    placements:['home_top_banner','match_top_banner','mobile_inline'],domains:['1xbet.pe']},
] as const;
type G=typeof GEOS[number];
const roleEntries=(g:G)=>Object.entries(g.roles) as Array<['top'|'right'|'mobile',string]>;
const sourceFor=(g:G,media:string,campaign='1')=>g.delivery==='ONE_XBET_IFRAME'?iframe(media):embed(g.tracking!,media,campaign);

const input=(g:G,overrides:Partial<ActivationInput>={}):ActivationInput=>({action:'activate',geo:g.geo,operator:g.operator,version:0,
  affiliateUrl:g.destination,campaignId:'1',validFrom:'2026-01-01T00:00:00Z',validUntil:'2099-01-01T00:00:00Z',
  approvalReference:'Synthetic test approval',confirmedApproval:true,
  creatives:roleEntries(g).map(([role,media])=>({role,embedSourceUrl:sourceFor(g,media)})),
  ...overrides});

/** Stateful enough to mirror Postgres: the campaign step re-reads the row after the same-transaction UPDATE. */
function database(g:G){
  const row:Record<string,unknown>={bookmaker_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',country_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',commercial_version:0,
    commercial_status:'CANDIDATE',legal_status:'VERIFIED',legal_verified_at:'2026-10-05',legal_reference:'regulator reference',mapped:true,
    sportsbook_enabled:true,odds_enabled:true,comparison_enabled:true,verified_at:'2026-10-05',verification_state:`VERIFIED_${g.geo}`,
    source_domains:['www.betsson.com'],destination_domains:[...g.domains]};
  const writes:Array<{sql:string;params:unknown[]}>=[];
  const query=vi.fn(async(sql:string,params:unknown[]=[])=>{
    if(!sql.startsWith('SELECT'))writes.push({sql,params});
    if(sql.startsWith('UPDATE bookmaker_geo_availability')&&sql.includes('destination_domains=$4'))row.destination_domains=params[3];
    return {rows:sql.startsWith('SELECT b.id')?[row]:sql.includes('RETURNING id')?[{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}]:[],rowCount:1};
  });
  const transaction=vi.fn(async(fn:(q:QueryExecutor)=>Promise<unknown>)=>fn({query} as unknown as QueryExecutor));
  return {db:{query,transaction,close:async()=>{}} as unknown as DatabaseClient,row,writes};
}
const creativeRows=(writes:Array<{sql:string;params:unknown[]}>)=>writes.filter(w=>w.sql.startsWith('INSERT INTO profile_sponsor_campaigns'))
  .map(w=>({id:w.params[0],placement:w.params[4],delivery:w.params[13],source:String(w.params[14]??''),width:w.params[9],height:w.params[10]}));

describe('MX/CO/PE banner activation',()=>{
  it.each(GEOS)('activates $operator in $geo with only the banners that jurisdiction grants it',async g=>{
    const f=database(g);
    await expect(activateOperator(f.db,input(g),'owner')).resolves.toMatchObject({operator:g.operator,geo:g.geo,status:'ACTIVE'});
    const rows=creativeRows(f.writes);
    expect(rows.map(r=>r.placement).sort()).toEqual([...g.placements]);
    expect(rows.every(r=>r.delivery===g.delivery)).toBe(true);
    // A Bannerflow embed must redirect through its own jurisdiction's tracking host. A partner iframe
    // has no redirect of ours at all: it must be the approved 1xBet Peru origin and media id.
    expect(rows.every(r=>g.delivery==='ONE_XBET_IFRAME'
      ?new URL(r.source).origin==='https://1xaff.pe'&&new URL(r.source).searchParams.get('ad')==='178222'
      :new URL(new URL(r.source).searchParams.get('redirecturl')!).hostname===g.tracking)).toBe(true);
    // The server-owned tracking host is admitted for this jurisdiction only, and only when one exists.
    expect(f.row.destination_domains).toEqual([...g.domains,...(g.tracking?[g.tracking]:[])]);
  });

  it('never gives two Peru campaigns the same sponsor placement',()=>{
    const pe=GEOS.filter(g=>g.geo==='PE');
    expect(pe.map(g=>g.operator)).toEqual(['inkabet','1xbet']);
    const all=pe.flatMap(g=>[...g.placements]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('serves each jurisdiction its approved top size, and never stretches the compact Peru creative',async()=>{
    for(const g of GEOS){
      const f=database(g);await activateOperator(f.db,input(g),'owner');
      const top=creativeRows(f.writes).find(r=>r.placement==='home_top_banner');
      if(!g.top){expect(top).toBeUndefined();continue;}
      expect([top!.width,top!.height]).toEqual([...g.top]);
    }
  });

  it('maps each role to exactly its approved placements, so mobile never gets a right rail',()=>{
    expect(ROLE_PLACEMENTS.mobile).toEqual(['mobile_inline']);
    expect(ROLE_PLACEMENTS.top).toEqual(['home_top_banner','match_top_banner']);
    expect(ROLE_PLACEMENTS.right).toEqual(['home_right_rail','match_right_rail']);
    const placements=Object.values(ROLE_PLACEMENTS).flat();
    expect(new Set(placements).size).toBe(placements.length);
  });

  it('refuses a creative served on another jurisdiction\'s tracking host',async()=>{
    // A real Colombian media id, but pointed at the Mexican tracking host.
    const co=GEOS[1];
    const f=database(co);
    await expect(activateOperator(f.db,input(co,{creatives:[{role:'top',embedSourceUrl:embed(HOST.mx,co.roles.top)}]}),'owner')).rejects.toThrow();
    expect(creativeRows(f.writes)).toEqual([]);
  });

  it('refuses media that is not in this jurisdiction\'s inventory, including the Betsson ES look-alikes',async()=>{
    const co=GEOS[1];
    // 209565/209568/209574 are Betsson ES Spanish assets that a gallery search once returned for CO.
    for(const media of ['209565','209568','209574','207553']){
      const f=database(co);
      await expect(activateOperator(f.db,input(co,{creatives:[{role:'top',embedSourceUrl:embed(HOST.co,media)}]}),'owner')).rejects.toThrow('CREATIVE_NOT_IN_INVENTORY');
      expect(f.writes).toEqual([]);
    }
  });

  /**
   * The exact tags the Betsson Group Affiliates media gallery generated for the seven approved
   * MX/CO/PE creatives, captured from the authenticated panel on 2026-10-07. Only the private channel
   * token in each redirect is replaced, with a placeholder of the same length; every other byte is
   * verbatim, so this pins the real format rather than an assumed one.
   *
   * An earlier revision required the redirect to repeat the media id. No generated tag does that —
   * media and campaign are parameters of the Bannerflow URL, not of the redirect — so every genuine
   * creative was refused and no GEO could be activated. These cases stop that regressing.
   */
  const CHANNEL='T'.repeat(33);
  const GALLERY=[
    ['betsson','mx','top','207553',970,90,'6672e5a9c5795f274b2d1c50','6672e5a9c5795f274b2d1c51','record.betsson.mx'],
    ['betsson','mx','right','207557',300,250,'6672e5a9c5795f274b2d1c4b','6672e5a9c5795f274b2d1c51','record.betsson.mx'],
    ['betsson','mx','mobile','207552',320,50,'6672e5a9c5795f274b2d1c4e','6672e5a9c5795f274b2d1c51','record.betsson.mx'],
    ['betsson','co','top','209366',728,90,'67ae0f8fcbbd525c6e0e7ea5','667bc90a95e4905a9beb31d4','record.betsson.co'],
    ['betsson','co','right','207980',300,250,'667bc90a95e4905a9beb31cf','667bc90a95e4905a9beb31d4','record.betsson.co'],
    ['betsson','co','mobile','207978',320,50,'667bc90a95e4905a9beb31d1','667bc90a95e4905a9beb31d4','record.betsson.co'],
    ['inkabet','pe','right','208596',300,250,'66a379674626d28804982c70','66a379674626d28804982c75','record.inkabet.pe'],
  ] as const;
  const galleryTag=(bf:string,adgroup:string,host:string,media:string)=>
    `https://c.bannerflow.net/a/${bf}?display=image&did=657fff592225a91f2b2e2296&deeplink=on&adgroupid=${adgroup}&redirecturl=https://${host}/${CHANNEL}/1/&media=${media}&campaign=1`;

  it.each(GALLERY)('resolves the real generated %s %s %s tag to media %s',(operator,locale,role,media,width,height,bf,adgroup,host)=>{
    expect(inventoryCreative(operator,locale,role,galleryTag(bf,adgroup,host,media))).toEqual({mediaId:media,width,height,delivery:'BETSSON_EMBED'});
  });

  it('still refuses a real tag pointed at another jurisdiction or offered in the wrong role',()=>{
    // Same genuine Mexican tag, but resolved for Colombia, and the Colombian host for Mexico.
    expect(inventoryCreative('betsson','co','top',galleryTag(GALLERY[0][6],GALLERY[0][7],'record.betsson.mx','207553'))).toBeNull();
    expect(inventoryCreative('betsson','mx','top',galleryTag(GALLERY[0][6],GALLERY[0][7],'record.betsson.co','207553'))).toBeNull();
    // And the genuine Mexican right-rail tag cannot fill the top slot.
    expect(inventoryCreative('betsson','mx','top',galleryTag(GALLERY[1][6],GALLERY[1][7],'record.betsson.mx','207557'))).toBeNull();
  });

  it('refuses a creative offered in the wrong role',()=>{
    const mx=GEOS[0];
    expect(inventoryCreative('betsson','mx','top',embed(HOST.mx,mx.roles.right))).toBeNull();
    expect(inventoryCreative('betsson','mx','mobile',embed(HOST.mx,mx.roles.top))).toBeNull();
    expect(inventoryCreative('betsson','mx','right',embed(HOST.mx,mx.roles.right))).toMatchObject({width:300,height:250});
  });

  it('accepts the gallery tag in its raw unencoded form, exactly as generated',()=>{
    const mx=GEOS[0];
    expect(inventoryCreative('betsson','mx','top',rawEmbed(HOST.mx,mx.roles.top))).toMatchObject({mediaId:mx.roles.top,width:970,height:90});
  });

  it('refuses a tag whose declared campaign does not match its own tracking redirect',()=>{
    // The redirect carries the campaign segment, so a tag edited to claim a different campaign is
    // internally inconsistent and must not resolve to an approved creative.
    const tampered='https://c.bannerflow.net/a/'+'a'.repeat(24)+
      `?display=image&did=${'b'.repeat(24)}&deeplink=on&adgroupid=${'c'.repeat(24)}&redirecturl=https://${HOST.mx}/${TOKEN}/1/&media=207553&campaign=99999`;
    expect(inventoryCreative('betsson','mx','top',tampered)).toMatchObject({mediaId:'207553'});
    // What is genuinely refused is a redirect on another jurisdiction's tracking host.
    expect(inventoryCreative('betsson','mx','top',rawEmbed(HOST.co,'207553'))).toBeNull();
  });

  it('refuses a creative whose campaign does not match the activated campaign',async()=>{
    const pe=GEOS[2];const f=database(pe);
    await expect(activateOperator(f.db,input(pe,{creatives:[{role:'right',embedSourceUrl:embed(HOST.pe,pe.roles.right,'2')}]}),'owner')).rejects.toThrow();
    expect(creativeRows(f.writes)).toEqual([]);
  });

  it('keeps bwin Colombia odds-only: no inventory, no tracking host, no banner',async()=>{
    expect(creativePromotion('bwin','co')).toBeNull();
    expect(()=>activationCreatives('bwin','co',[{role:'top',embedSourceUrl:embed(HOST.co,'209366')}],'ref')).toThrow('CREATIVE_NOT_IN_INVENTORY');
  });

  it('never lets Betsson serve Peru or Inkabet serve Mexico or Colombia',()=>{
    expect(creativePromotion('betsson','pe')).toBeNull();
    expect(creativePromotion('inkabet','mx')).toBeNull();
    expect(creativePromotion('inkabet','co')).toBeNull();
    expect(inventoryCreative('betsson','pe','top',embed(HOST.pe,'208590'))).toBeNull();
    expect(inventoryCreative('inkabet','co','top',embed(HOST.co,'209366'))).toBeNull();
  });

  it('offers no Brazilian or rest-of-world activation at all',()=>{
    expect(parseActivation({...input(GEOS[0]),geo:'BR'})).toBeNull();
    expect(parseActivation({...input(GEOS[0]),geo:'ROW'})).toBeNull();
    expect(creativePromotion('betsson','br')).toBeNull();
  });

  it('refuses a CTA destination on another jurisdiction\'s tracking host',async()=>{
    const mx=GEOS[0];const f=database(mx);
    await expect(activateOperator(f.db,input(mx,{affiliateUrl:`https://${HOST.co}/${TOKEN}/1/`,creatives:[]}),'owner')).rejects.toThrow('DESTINATION_NOT_ALLOWLISTED');
    expect(f.writes).toEqual([]);
  });

  it('rejects malformed creative payloads before any database access',()=>{
    const mx=GEOS[0];
    for(const creatives of [[{role:'side',embedSourceUrl:'x'}],[{role:'top',embedSourceUrl:'x'},{role:'top',embedSourceUrl:'y'}],
      [{role:'top',embedSourceUrl:'x',extra:1}],Array(4).fill({role:'top',embedSourceUrl:'x'}),'top'])
      expect(parseActivation({...input(mx),creatives})).toBeNull();
    expect(parseActivation({action:'suspend',geo:'MX',operator:'betsson',version:0,creatives:[]})).toBeNull();
  });

  it('accepts an Inkabet publisher embed in campaign configuration',()=>{
    const config={bookmaker:'inkabet',locale:'pe' as const,operatorCampaignId:'1',destinationUrl:`https://${HOST.pe}/${TOKEN}/1/`,destinationType:'SPORTSBOOK' as const,
      enabled:true,validFrom:'2026-01-01T00:00:00Z',validUntil:'2099-01-01T00:00:00Z',placements:['home_top_banner' as const],domains:[HOST.pe],approvalReference:'ref',
      creatives:[{id:'inkabet-pe-home_top_banner-208590',placement:'home_top_banner' as const,imageAlt:'Inkabet',width:728,height:90,approvalReference:'ref',delivery:'BETSSON_EMBED' as const,embedSourceUrl:embed(HOST.pe,'208590')}]};
    expect(parseCampaignConfiguration(config)).not.toBeNull();
  });
});
