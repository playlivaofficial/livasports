import type {SiteLocale} from '@/config/i18n';
import {safeAffiliateDestination} from '@/odds/affiliate';

export function embedDimensions(placement:string,width:number,height:number){
  // 320x50 is the mobile leaderboard in the MX/CO/PE inventory; 320x100 is the existing BR size.
  if(placement==='mobile_inline'||placement==='profile_mobile_inline')return width===320&&(height===100||height===50);
  if(placement.endsWith('right_rail'))return width===300&&(height===600||height===250);
  // 728x90 is the only top size offered for CO and PE; MX also has 970x90.
  if(placement.includes('top_'))return (width===970||width===728)&&height===90;
  return false;
}

/**
 * Exact tracking host per operator and jurisdiction, from the collected affiliate inventory. An
 * operator/GEO absent here can never serve a publisher embed, which is what keeps bwin Colombia
 * odds-only: no Entain affiliate access exists, so it has no tracking host.
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
