// Bounded, explicit editorial asset acquisition. No arbitrary URL input or model calls.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const assets=[
 {id:'bundesliga-wordmark',url:'https://upload.wikimedia.org/wikipedia/commons/1/15/Bundesliga_logo.svg',sha256:'cfe749860a4d5d9ce42eb170b25e0c339343c233158c365235cfdabb1fabaa2a'},
 {id:'cruz-azul',url:'https://upload.wikimedia.org/wikipedia/commons/8/86/Club_de_F%C3%BAtbol_Cruz_Azul_logo.svg',sha256:'096bdaceebe4d8c2eb432d83bab46dbd794623f71608b46fb9d203ffe2f97a29'},
];
await mkdir('public/sports-identities',{recursive:true});
for(const asset of assets){
 const response=await fetch(asset.url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'LivaSports-EditorialAssetReview/3.0 (+https://livasports.com)'}});
 if(!response.ok)throw Error(`ASSET_HTTP_${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>100000)throw Error('ASSET_TOO_LARGE');
 if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error('ASSET_CHANGED_REVIEW_REQUIRED');
 const svg=bytes.toString('utf8');if(!svg.includes('<svg')||/<(?:script|foreignObject|image|use)\b|(?:href|src)\s*=|\bon\w+\s*=/i.test(svg))throw Error('UNSAFE_SVG');
 // Rasterize untrusted SVG; retain original proportions, no recoloring or invented artwork.
 const png=await sharp(bytes).resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 await writeFile(`public/sports-identities/${asset.id}.png`,png);
 console.log(JSON.stringify({id:asset.id,sourceSha256:createHash('sha256').update(bytes).digest('hex'),sha256:createHash('sha256').update(png).digest('hex'),bytes:png.length}));
}
