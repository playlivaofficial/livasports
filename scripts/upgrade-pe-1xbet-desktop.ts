import {readFile,writeFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient} from '../src/database/client';
import {configureCampaign,parseCampaignConfiguration,type CampaignConfiguration} from '../src/affiliate/configuration';
import {safeOneXBetIframe} from '../src/affiliate/embed-policy';
import {creativeAlt} from '../src/affiliate/creative-inventory';

// Requires the privately saved official generated code. Dry-run unless --apply is supplied.
// Reconfigure through the ordinary approval/revocation/audit path, preserving the campaign and mobile.
const sourceFile=process.argv.find(a=>a.startsWith('--source='))?.slice(9);
if(!sourceFile)throw Error('OFFICIAL_GENERATED_CODE_REQUIRED');
const html=await readFile(sourceFile,'utf8'),raw=/src="([^"]+)"/.exec(html)?.[1];
if(!raw||!/^I\?tag=[A-Za-z0-9_-]+&site=6175483&ad=178238$/.test(raw))throw Error('VERIFIED_GENERATED_CODE_REQUIRED');
const source=`https://1xaff.pe/${raw}`;
if(!safeOneXBetIframe(source,'1xbet','pe'))throw Error('INVALID_OFFICIAL_EMBED');
const db=new PostgresDatabaseClient(databaseUrl()!);
try{
  const rows=(await db.query(`SELECT a.*,l.destination_url FROM affiliate_campaigns a
    JOIN affiliate_links l ON l.id=a.affiliate_link_id JOIN bookmakers b ON b.id=l.bookmaker_id
    JOIN countries c ON c.id=l.country_id WHERE b.provider_slug='1xbet' AND c.iso2='PE' AND a.enabled`)).rows;
  if(rows.length!==1)throw Error('UNIQUE_EXISTING_CAMPAIGN_REQUIRED');
  const row=rows[0],creatives=(await db.query('SELECT * FROM profile_sponsor_campaigns WHERE affiliate_campaign_id=$1 AND enabled',[row.id])).rows;
  if(creatives.length!==3||!['home_top_banner','match_top_banner','mobile_inline'].every(p=>creatives.filter(c=>c.placement===p).length===1))throw Error('EXISTING_SPLIT_LAYOUT_REQUIRED');
  const reference='1xBet Partners Peru authenticated media 178238 WELCOME BONUS_PERU_2025_800x200, Peruvian Spanish, generated for LivaSports site 6175483; verified 2026-10-08';
  const config:CampaignConfiguration={bookmaker:'1xbet',locale:'pe',operatorCampaignId:row.operator_campaign_id,destinationUrl:row.destination_url,destinationType:row.destination_type,
    enabled:row.enabled,validFrom:new Date(row.valid_from).toISOString(),validUntil:new Date(row.valid_until).toISOString(),placements:row.placement_allowlist,domains:row.operator_domain_allowlist,approvalReference:reference,
    creatives:creatives.map(c=>c.placement==='mobile_inline'?{id:c.id,placement:c.placement,imageAlt:c.image_alt,width:c.creative_width,height:c.creative_height,approvalReference:c.approval_reference,delivery:c.delivery_type,embedSourceUrl:c.embed_source_url}:
      {id:`1xbet-pe-${c.placement}-178238`,placement:c.placement,imageAlt:creativeAlt('1xbet'),width:800,height:200,approvalReference:reference,delivery:'ONE_XBET_IFRAME',embedSourceUrl:source})};
  if(!parseCampaignConfiguration(config))throw Error('INVALID_APPROVED_CONFIGURATION');
  const apply=process.argv.includes('--apply');
  if(apply){await writeFile('output/peru-desktop-before-private.json',JSON.stringify({row,creatives},null,2));await configureCampaign(db,config);}
  console.log(JSON.stringify({apply,operator:'1xbet',geo:'PE',creatives:config.creatives!.map(c=>({placement:c.placement,width:c.width,height:c.height,id:c.id})),mobilePreserved:true,approvalReference:reference}));
}finally{await db.close();}
