// Acquisition for manual visual review, never automatic public approval.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import sharp from 'sharp';
const reviewed=[
 {id:'lakers',name:'Los Angeles Lakers',file:'Los_Angeles_Lakers_logo.svg',nba:'1610612747'},
 {id:'nets',name:'Brooklyn Nets',file:'Brooklyn_Nets_logo_primario_2024.png',nba:'1610612751'},
];
const dir='output/v3-qa/v35/identity-review';await mkdir(dir,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function get(url){if(!['commons.wikimedia.org','upload.wikimedia.org','cdn.nba.com'].includes(new URL(url).hostname))throw Error('HOST');const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP_'+r.status);const b=Buffer.from(await r.arrayBuffer());if(b.length>2000000)throw Error('SIZE');return b;}
async function raster(bytes){if(bytes.toString().includes('<svg')&&/<(?:script|foreignObject|image)\b|(?:href|src)\s*=\s*["'](?!#)|\bon\w+\s*=/i.test(bytes.toString()))throw Error('UNSAFE_SVG');return sharp(bytes).resize({width:256,height:256,fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});}
const records=[];
for(const asset of reviewed){
 const source='https://commons.wikimedia.org/wiki/File:'+asset.file,html=(await get(source)).toString(),$=load(html),official='https://cdn.nba.com/logos/nba/'+asset.nba+'/primary/L/logo.svg';
 if(!html.includes('PD-textlogo')||!html.includes(official))throw Error('RIGHTS_OR_OFFICIAL_SOURCE_CHANGED');
 const original=$('.fullImageLink a').first().attr('href');if(!original||new URL(original).hostname!=='upload.wikimedia.org')throw Error('ASSET_HOST');
 const raw=await get(original),{data,info}=await raster(raw);await writeFile(dir+'/'+asset.id+'.png',data);
 const reference=await raster(await get(official));await writeFile(dir+'/'+asset.id+'-official.png',reference.data);
 records.push({id:asset.id,name:asset.name,source,official,original,sourceSha256:sha(raw),sha256:sha(data),width:info.width,height:info.height,reviewedOn:'2026-10-26',copyrightBasis:'Commons PD-textlogo declaration',trademarkRights:'not-granted',use:'editorial-identification-only',publicApproved:false});
}
await writeFile(dir+'/assets.json',JSON.stringify(records,null,2));console.log(JSON.stringify(records));
