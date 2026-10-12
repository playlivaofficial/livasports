import type {SiteLocale} from '@/config/i18n';
import {safeAffiliateDestination} from '@/odds/affiliate';
import {isPublisherEmbed} from './types';

export function embedDimensions(placement:string,width:number,height:number,delivery?:string){
  // 320x50 is the mobile leaderboard in the MX/CO/PE inventory; 320x100 is the existing BR size.
  if(placement==='mobile_inline'||placement==='profile_mobile_inline')return width===320&&(height===100||height===50);
  if(placement.endsWith('right_rail'))return width===300&&(height===600||height===250);
  // 970x90 and 728x90 are the Bannerflow desktop leaderboards: 728x90 is the only top size CO and PE
  // publish for these promotions, MX also has 970x90. The 1xBet Peru partner platform publishes no
  // leaderboard at all for the approved Peru promotion. Its official 800x200 is the desktop top;
  // the legacy 320x50 remains admissible during activation and on mobile. Neither is stretched:
  // the renderer only ever scales a creative down, and the inventory binds this size to one media id.
  if(placement.includes('top_'))return delivery==='ONE_XBET_IFRAME'?((width===320&&height===50)||(width===800&&height===200)):(width===970||width===728)&&height===90;
  return false;
}

/**
 * Exact Bannerflow tracking host per operator and jurisdiction, from the collected affiliate
 * inventory. An operator/GEO absent here can never serve a Bannerflow publisher embed. bwin Colombia
 * and Winpot Mexico are absent on purpose: Entain serves its own zone iframe and Winpot a plain image,
 * and their outbound tracking hosts are declared separately in OUTBOUND_TRACKERS below.
 *
 * 1xBet Peru is deliberately absent. Its approved creative is the operator's own partner iframe,
 * which carries its tracking internally through the server-side `tag`, so there is no redirect host
 * of ours to allowlist. `safeOneXBetIframe` gates that delivery instead.
 */
const EMBED_TRACKING_HOSTS:Record<string,string>={
  'betsson:br':'record.betsson.bet.br',
  'betsson:mx':'record.betsson.mx',
  'betsson:co':'record.betsson.co',
  'inkabet:pe':'record.inkabet.pe',
};
export function embedTrackingHost(operator:string,locale:string):string|null{return EMBED_TRACKING_HOSTS[`${operator}:${locale}`]??null;}

// The exact publisher image-mode contract observed in the approved libraries. Named for the
// BETSSON_EMBED delivery_type it validates; it now covers every operator in EMBED_TRACKING_HOSTS.
// This is not a general HTML/script importer. Values remain private configuration.
export function safeBetssonEmbed(source:unknown,campaignId:string,operator='betsson',locale:SiteLocale='br'):string|null{
  const trackingHost=embedTrackingHost(operator,locale);if(!trackingHost)return null;
  if(typeof source!=='string'||source.length>4096||/[\s\\\u0000-\u001f\u007f]/.test(source)||/%0[ad]/i.test(source))return null;
  try{
    const u=new URL(source),q=u.searchParams;
    const keys=['display','did','deeplink','adgroupid','redirecturl','media','campaign'];
    if(u.protocol!=='https:'||u.hostname!=='c.bannerflow.net'||u.port||u.username||u.password||u.hash||!/^\/a\/[a-f0-9]{24}$/.test(u.pathname)||u.href!==source||
      [...q.keys()].length!==keys.length||keys.some(k=>q.getAll(k).length!==1)||[...q.keys()].some(k=>!keys.includes(k))||
      q.get('display')!=='image'||q.get('deeplink')!=='on'||!/^\d{1,5}$/.test(campaignId)||q.get('campaign')!==campaignId||
      !/^[a-f0-9]{24}$/.test(q.get('did')??'')||!/^[a-f0-9]{24}$/.test(q.get('adgroupid')??'')||!/^\d{1,10}$/.test(q.get('media')??''))return null;
    const destination=safeAffiliateDestination(operator,locale,q.get('redirecturl'));
    // The official publisher tag supplies a tracking base separately from its
    // media/campaign parameters. Do not append or reconstruct the destination.
    if(!destination||new URL(destination).hostname!==trackingHost)return null;
    return source;
  }catch{return null;}
}

/**
 * The single origin the 1xBet Peru affiliate platform serves its generated creatives from, and the
 * only origin `frame-src` is widened to in the sandboxed publisher document. Nothing else about that
 * document's Content-Security-Policy is relaxed, and no other 1xBet domain is admitted anywhere.
 *
 * This is the serving host, not the panel host. partners.1xbet.pe is where an affiliate signs in and
 * generates code; the code it emits points at 1xaff.pe, which is the same host its direct links and
 * click redirects use (/L for a link, /I for a banner impression, /C for the click-through). Verified
 * on 2026-10-07: 1xaff.pe/I returns the approved 320x50 creative image, while the same path on
 * partners.1xbet.pe returns the panel's own 404 page. Peru mirrors Brazil, where the approved 1xBet
 * links already use 1xaff.com.br rather than a 1xbet.com host.
 */
export const ONE_XBET_IFRAME_ORIGIN='https://1xaff.pe';
export const ONE_XBET_IFRAME_HOST='1xaff.pe';
/**
 * The verified LivaSports publisher site id on the 1xBet Partners platform, read off our own
 * authenticated account. It identifies the publisher, carries no authority by itself and appears in
 * every served creative URL, so it is configuration rather than a secret. A creative naming any other
 * site id belongs to somebody else and is refused.
 */
export const ONE_XBET_SITE_ID='6175483';
/**
 * Approved 1xBet Peru creatives: media/ad id to native size, each verified against the platform's own
 * media record (brand, promotion, language, product and dimensions) on 2026-10-06.
 *
 * 178222 is `WELCOME BONUS_PERU_2025_320x50`, Peruvian Spanish, 320x50. On 2026-10-08 the authenticated
 * official media record and generated LivaSports code verified 178238 as the same promotion in
 * Peruvian Spanish at 800x200. It is approved for desktop top placements only; mobile stays 178222.
 */
export const ONE_XBET_PE_CREATIVES:Readonly<Record<string,{width:number;height:number}>>={'178222':{width:320,height:50},'178238':{width:800,height:200}};

/**
 * The exact 1xBet Peru partner-iframe contract. This is not a general iframe importer: an approved
 * creative is one `https://1xaff.pe/I` URL carrying exactly `tag`, `site` and `ad`, where
 * `site` is our verified publisher id and `ad` an approved Peru media id. Any other host, path, query
 * parameter, site or media id fails closed, and the delivery is bound to 1xBet in Peru alone.
 *
 * `tag` is the private per-channel token. Only its shape is checked here; its value lives solely in
 * the server-side campaign configuration and is never logged, echoed or returned to a client.
 */
export function safeOneXBetIframe(source:unknown,operator:string,locale:string):string|null{
  if(operator!=='1xbet'||locale!=='pe')return null;
  if(typeof source!=='string'||source.length>512||/[\s\\\u0000-\u001f\u007f]/.test(source)||/%0[ad]/i.test(source))return null;
  try{
    const u=new URL(source),q=u.searchParams,keys=['tag','site','ad'];
    if(u.protocol!=='https:'||u.origin!==ONE_XBET_IFRAME_ORIGIN||u.hostname!==ONE_XBET_IFRAME_HOST||u.port||u.username||u.password||u.hash||u.pathname!=='/I'||u.href!==source)return null;
    if([...q.keys()].length!==keys.length||keys.some(k=>q.getAll(k).length!==1)||[...q.keys()].some(k=>!keys.includes(k)))return null;
    if(q.get('site')!==ONE_XBET_SITE_ID||!Object.hasOwn(ONE_XBET_PE_CREATIVES,q.get('ad')??''))return null;
    if(!/^[A-Za-z0-9_-]{8,64}$/.test(q.get('tag')??''))return null;
    return source;
  }catch{return null;}
}
/** The approved media id a 1xBet Peru creative names, or null when the creative is not approved. */
export function oneXBetMediaId(source:unknown,operator:string,locale:string):string|null{
  const safe=safeOneXBetIframe(source,operator,locale);return safe?new URL(safe).searchParams.get('ad'):null;
}

/**
 * The single origin Entain Partners serves its generated zone code from, and the only origin
 * `frame-src` is widened to for this delivery. The zone document it returns loads the operator's own
 * Bannerflow creative with Entain's click tracking (`trackAffiliateClick.do`) built in, so nothing of
 * ours is rebuilt or appended.
 */
export const ENTAIN_IFRAME_ORIGIN='https://mediaserver.entainpartners.com';
export const ENTAIN_IFRAME_HOST='mediaserver.entainpartners.com';
/**
 * Approved bwin Colombia zones: zone id to native size. Each zone was generated on 2026-10-12 in the
 * authenticated Entain Partners account (NIKA1578) under the "LivaSports CO" campaign (1148303) and
 * tracker 5746233 for https://livasports.com/co, from the Spanish-language sportsbook resource
 * "BWIN COLUMBIA SPORTS WELCOME BONUS" ("Haz tu apuesta segura hasta 250.000 COP"), bonus offer
 * "Risk-free bet up to 250k COP". A zone id names our generated placement and appears in the public
 * iframe's own id, so it is configuration rather than a secret.
 *
 *   2247630 · resource 42990 · 300x250 · desktop right rail
 *   2247631 · resource 42995 · 320x50  · mobile
 */
export const ENTAIN_CO_ZONES:Readonly<Record<string,{width:number;height:number}>>={'2247630':{width:300,height:250},'2247631':{width:320,height:50}};

/**
 * The exact Entain Partners zone-iframe contract, as the panel generates it (HTTPS, secure-domain
 * variant): `https://mediaserver.entainpartners.com/renderBanner.do?zoneId=<zone>&t=f&v=1&securedDomain=y`.
 * Any other host, path, parameter, value or zone fails closed, and the delivery is bound to bwin in
 * Colombia alone. Entain forbids altering the generated code, so the URL must match byte for byte.
 */
export function safeEntainIframe(source:unknown,operator:string,locale:string):string|null{
  if(operator!=='bwin'||locale!=='co')return null;
  if(typeof source!=='string'||source.length>256)return null;
  try{
    const u=new URL(source),zone=u.searchParams.get('zoneId')??'';
    if(u.origin!==ENTAIN_IFRAME_ORIGIN||u.hostname!==ENTAIN_IFRAME_HOST||u.pathname!=='/renderBanner.do'||!Object.hasOwn(ENTAIN_CO_ZONES,zone))return null;
    return source===`${ENTAIN_IFRAME_ORIGIN}/renderBanner.do?zoneId=${zone}&t=f&v=1&securedDomain=y`?source:null;
  }catch{return null;}
}
/** The approved zone id a bwin Colombia creative names, or null when the creative is not approved. */
export function entainZoneId(source:unknown,operator:string,locale:string):string|null{
  const safe=safeEntainIframe(source,operator,locale);return safe?new URL(safe).searchParams.get('zoneId'):null;
}
/** Native size of an approved partner-iframe creative, or null. Sizes are bound to the media id. */
export function partnerIframeSize(delivery:string|undefined|null,source:unknown,operator:string,locale:string):{width:number;height:number}|null{
  if(delivery==='ONE_XBET_IFRAME')return ONE_XBET_PE_CREATIVES[oneXBetMediaId(source,operator,locale)??'']??null;
  if(delivery==='ENTAIN_IFRAME')return ENTAIN_CO_ZONES[entainZoneId(source,operator,locale)??'']??null;
  return null;
}

/** Validates a publisher embed under its own delivery contract. An unknown delivery serves nothing. */
export function safePublisherEmbed(delivery:string|undefined|null,source:unknown,campaignId:string,operator:string,locale:SiteLocale):string|null{
  if(!isPublisherEmbed(delivery))return null;
  if(delivery==='BETSSON_EMBED')return safeBetssonEmbed(source,campaignId,operator,locale);
  return delivery==='ENTAIN_IFRAME'?safeEntainIframe(source,operator,locale):safeOneXBetIframe(source,operator,locale);
}

/**
 * Operators whose outbound affiliate link starts on a tracking host that is not a Bannerflow redirect
 * host, each pinned to the exact link shape its panel generates. These widen only the destination
 * allowlist an owner activation may write; they never admit a publisher embed.
 *
 *  - bwin Colombia: Entain's text-link tracker for the same campaign and tracker as the zones above
 *    (zone 2247632, resource 42989 "BWIN Columbia Sports Welcome Offer"). Verified on 2026-10-12 to
 *    303 to https://www.bwin.co/es/engage/lan/sports/bono-bienvenida?wm=5746233.
 *  - Winpot Mexico: the MyAffiliates (Affiliates World) tracking host. The path segment is the private
 *    per-link token, so only its shape is checked; the value lives in the server-side campaign row.
 *    The approved "Sportbook 500$ free" link was verified on 2026-10-12 to 301 to
 *    sport.winpot.mx/extend_sportsbook_v1_b1_spoff1_s/ with our affiliate attribution.
 */
const OUTBOUND_TRACKERS:Record<string,{host:string;valid:(url:URL)=>boolean}>={
  'bwin:co':{host:ENTAIN_IFRAME_HOST,valid:url=>url.href===`${ENTAIN_IFRAME_ORIGIN}/renderBanner.do?zoneId=2247632`},
  'winpot.mx:mx':{host:'record.affiliatesworld.com',valid:url=>/^\/_[A-Za-z0-9_-]{16,64}\/1\/$/.test(url.pathname)&&!url.search&&!url.hash},
};
/** The tracking host an activation may add to the destination allowlist, from server code only. */
export function affiliateTrackingHost(operator:string,locale:string):string|null{
  return embedTrackingHost(operator,locale)??OUTBOUND_TRACKERS[`${operator}:${locale}`]?.host??null;
}
/** A destination on a non-Bannerflow tracking host must match that panel's exact link shape. */
export function trackingDestinationShapeValid(operator:string,locale:string,destination:string):boolean{
  const tracker=OUTBOUND_TRACKERS[`${operator}:${locale}`];
  try{const url=new URL(destination);return !tracker||url.hostname!==tracker.host||tracker.valid(url);}catch{return false;}
}
