/** One-off, bounded asset preparation. No runtime fetching, secrets, API keys or paid services. */
import {mkdir} from 'node:fs/promises';
import sharp from 'sharp';
const assets=[
 {id:'ufc-octagon',url:'https://upload.wikimedia.org/wikipedia/commons/d/da/UFCOctagon.jpg'},
 {id:'basketball-arena',url:'https://upload.wikimedia.org/wikipedia/commons/f/fe/012308-TC-Twolves001.jpg'},
 {id:'tennis-court',url:'https://upload.wikimedia.org/wikipedia/commons/c/c0/Uk_london_Centre_Court_Wimbledon.jpg'},
];
async function read(url,max){
 if(!['commons.wikimedia.org','upload.wikimedia.org'].includes(new URL(url).hostname))throw Error('UNAPPROVED_ASSET_HOST');
 const response=await fetch(url,{redirect:'error',headers:{'User-Agent':'LivaSports/3.0 (editorial asset preparation; https://livasports.com)'},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error(`ASSET_HTTP_${response.status}`);
 if(Number(response.headers.get('content-length'))>max)throw Error('ASSET_TOO_LARGE');
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>max)throw Error('ASSET_TOO_LARGE');chunks.push(chunk);}
 return Buffer.concat(chunks);
}
await mkdir('public/editorial',{recursive:true});
for(const asset of assets.filter(item=>!process.argv[2]||item.id===process.argv[2])){
 let url=asset.url;
 if(!url){const page=(await read(asset.page,2000000)).toString('utf8');url=page.match(/class="fullImageLink"[^>]*>\s*<a href="(https:\/\/upload\.wikimedia\.org\/[^"?]+)"/)?.[1];if(!url)throw Error('ASSET_ORIGINAL_NOT_FOUND');}
 const bytes=await read(url,20000000),metadata=await sharp(bytes).metadata();
 if((metadata.width??0)<1920)throw Error('ASSET_RESOLUTION_TOO_LOW');
 const variants=[];
 for(const width of [640,1280,1920]){const info=await sharp(bytes).resize({width,withoutEnlargement:true}).webp({quality:82}).toFile(`public/editorial/${asset.id}-${width}.webp`);variants.push({width:info.width,height:info.height,bytes:info.size});}
 console.log(JSON.stringify({asset:asset.id,original:url,variants}));
}
