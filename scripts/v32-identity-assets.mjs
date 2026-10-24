// Explicit reviewed Commons PD-textlogo declarations; editorial identification, no trademark licence.
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const assets=[
 {id:'serie-a',title:'Serie A.svg',url:'https://upload.wikimedia.org/wikipedia/commons/a/aa/Serie_A.svg',author:'Lega Nazionale Professionisti Serie A'},
 {id:'inter',title:'FC Internazionale Milano 2021.svg',url:'https://upload.wikimedia.org/wikipedia/commons/0/05/FC_Internazionale_Milano_2021.svg',author:'FC Internazionale Milano / Bureau Borsche'},
 {id:'juventus',title:'Juventus FC - logo black (Italy, 2020).svg',url:'https://upload.wikimedia.org/wikipedia/commons/e/ed/Juventus_FC_-_logo_black_%28Italy%2C_2020%29.svg',author:'Interbrand / Juventus Football Club'}
];
const report=[];for(const asset of assets){const r=await fetch(asset.url,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('ASSET_HTTP_'+r.status);const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>100000||!bytes.toString().includes('<svg')||/<(?:script|foreignObject|image|use)\b|(?:href|src)\s*=|\bon\w+\s*=/i.test(bytes.toString()))throw Error('UNSAFE_SVG');
 const png=await sharp(bytes).resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).png().toBuffer(),meta=await sharp(png).metadata();
 await writeFile('public/sports-identities/'+asset.id+'.png',png);report.push({...asset,source:'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(asset.title.replaceAll(' ','_')),width:meta.width,height:meta.height,sourceSha256:createHash('sha256').update(bytes).digest('hex'),sha256:createHash('sha256').update(png).digest('hex'),rights:'Commons PD-textlogo declaration; editorial identification only; trademark rights not granted',reviewedOn:'2026-10-24'});
}await mkdir('output/v3-qa/v32/source-review',{recursive:true});await writeFile('output/v3-qa/v32/source-review/assets.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
