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
const embed=(host:string,media:string,campaign='1',redirectMedia=media)=>'https://c.bannerflow.net/a/'+'a'.repeat(24)+'?'+new URLSearchParams({
  display:'image',did:'b'.repeat(24),deeplink:'on',adgroupid:'c'.repeat(24),
  redirecturl:`https://${host}/${TOKEN}/1/&media=${redirectMedia}&campaign=${campaign}`,media,campaign});

const GEOS=[
  {geo:'MX',locale:'mx',operator:'betsson',top:'207553',right:'207557',mobile:'207552',domains:['betsson.mx','www.betsson.mx']},
  {geo:'CO',locale:'co',operator:'betsson',top:'209366',right:'207980',mobile:'207978',domains:['betsson.co']},
  {geo:'PE',locale:'pe',operator:'inkabet',top:'208590',right:'208596',mobile:'208595',domains:['inkabet.pe']},
] as const;
type G=typeof GEOS[number];

const input=(g:G,overrides:Partial<ActivationInput>={}):ActivationInput=>({action:'activate',geo:g.geo,operator:g.operator,version:0,
  affiliateUrl:`https://${HOST[g.locale]}/${TOKEN}/1/`,campaignId:'1',validFrom:'2026-01-01T00:00:00Z',validUntil:'2099-01-01T00:00:00Z',
  approvalReference:'Synthetic test approval',confirmedApproval:true,
  creatives:[{role:'top',embedSourceUrl:embed(HOST[g.locale],g.top)},{role:'right',embedSourceUrl:embed(HOST[g.locale],g.right)},{role:'mobile',embedSourceUrl:embed(HOST[g.locale],g.mobile)}],
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
  it.each(GEOS)('activates $operator in $geo with its own banners on its own tracking host',async g=>{
    const f=database(g);
    await expect(activateOperator(f.db,input(g),'owner')).resolves.toMatchObject({operator:g.operator,geo:g.geo,status:'ACTIVE'});
    const rows=creativeRows(f.writes);
    // Desktop top on both page types, right rail on both, and mobile top only.
    expect(rows.map(r=>r.placement).sort()).toEqual(['home_right_rail','home_top_banner','match_right_rail','match_top_banner','mobile_inline']);
    expect(rows.every(r=>r.delivery==='BETSSON_EMBED')).toBe(true);
    expect(rows.every(r=>new URL(new URL(r.source).searchParams.get('redirecturl')!).hostname===HOST[g.locale])).toBe(true);
    // The server-owned tracking host is admitted for this jurisdiction only.
    expect(f.row.destination_domains).toEqual([...g.domains,HOST[g.locale]]);
  });

  it('uses the preferred 970x90 for Mexico and 728x90 where no 970x90 exists',async()=>{
    for(const g of GEOS){
      const f=database(g);await activateOperator(f.db,input(g),'owner');
      const top=creativeRows(f.writes).find(r=>r.placement==='home_top_banner')!;
      expect([top.width,top.height]).toEqual(g.geo==='MX'?[970,90]:[728,90]);
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
    await expect(activateOperator(f.db,input(co,{creatives:[{role:'top',embedSourceUrl:embed(HOST.mx,co.top)}]}),'owner')).rejects.toThrow();
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

  it('refuses a creative offered in the wrong role',()=>{
    const mx=GEOS[0];
    expect(inventoryCreative('betsson','mx','top',embed(HOST.mx,mx.right))).toBeNull();
    expect(inventoryCreative('betsson','mx','mobile',embed(HOST.mx,mx.top))).toBeNull();
    expect(inventoryCreative('betsson','mx','right',embed(HOST.mx,mx.right))).toMatchObject({width:300,height:250});
  });

  it('refuses a tag whose tracking redirect names different media than the tag itself',()=>{
    expect(inventoryCreative('betsson','mx','top',embed(HOST.mx,'207553','1','207551'))).toBeNull();
  });

  it('refuses a creative whose campaign does not match the activated campaign',async()=>{
    const pe=GEOS[2];const f=database(pe);
    await expect(activateOperator(f.db,input(pe,{creatives:[{role:'top',embedSourceUrl:embed(HOST.pe,pe.top,'2')}]}),'owner')).rejects.toThrow();
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
    const pe=GEOS[2];
    const config={bookmaker:'inkabet',locale:'pe' as const,operatorCampaignId:'1',destinationUrl:`https://${HOST.pe}/${TOKEN}/1/`,destinationType:'SPORTSBOOK' as const,
      enabled:true,validFrom:'2026-01-01T00:00:00Z',validUntil:'2099-01-01T00:00:00Z',placements:['home_top_banner' as const],domains:[HOST.pe],approvalReference:'ref',
      creatives:[{id:'inkabet-pe-home_top_banner-208590',placement:'home_top_banner' as const,imageAlt:'Inkabet',width:728,height:90,approvalReference:'ref',delivery:'BETSSON_EMBED' as const,embedSourceUrl:embed(HOST.pe,pe.top)}]};
    expect(parseCampaignConfiguration(config)).not.toBeNull();
  });
});
