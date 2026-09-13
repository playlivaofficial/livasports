import {safeAffiliateDestination} from '@/odds/affiliate';

export function embedDimensions(placement:string,width:number,height:number){
  if(placement==='mobile_inline'||placement==='profile_mobile_inline')return width===320&&height===100;
  if(placement.endsWith('right_rail'))return width===300&&(height===600||height===250);
  if(placement.includes('top_'))return width===970&&height===90;
  return false;
}

// The exact publisher image-mode contract observed in the approved BR library.
// This is not a general HTML/script importer. Values remain private configuration.
export function safeBetssonEmbed(source:unknown,campaignId:string):string|null{
  if(typeof source!=='string'||source.length>4096||/[\s\\\u0000-\u001f\u007f]/.test(source)||/%0[ad]/i.test(source))return null;
  try{
    const u=new URL(source),q=u.searchParams;
    const keys=['display','did','deeplink','adgroupid','redirecturl','media','campaign'];
    if(u.protocol!=='https:'||u.hostname!=='c.bannerflow.net'||u.port||u.username||u.password||u.hash||!/^\/a\/[a-f0-9]{24}$/.test(u.pathname)||u.href!==source||
      [...q.keys()].length!==keys.length||keys.some(k=>q.getAll(k).length!==1)||[...q.keys()].some(k=>!keys.includes(k))||
      q.get('display')!=='image'||q.get('deeplink')!=='on'||!/^\d{1,5}$/.test(campaignId)||q.get('campaign')!==campaignId||
      !/^[a-f0-9]{24}$/.test(q.get('did')??'')||!/^[a-f0-9]{24}$/.test(q.get('adgroupid')??'')||!/^\d{1,10}$/.test(q.get('media')??''))return null;
    const destination=safeAffiliateDestination('betsson','br',q.get('redirecturl'));
    // The official publisher tag supplies a tracking base separately from its
    // media/campaign parameters. Do not append or reconstruct the destination.
    if(!destination||new URL(destination).hostname!=='record.betsson.bet.br')return null;
    return source;
  }catch{return null;}
}
