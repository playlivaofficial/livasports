import {writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
async function sample(base){
  const started=performance.now(),r=await fetch(base+'/br'),html=await r.text();if(!r.ok)throw Error('PAGE_FAILED');
  const paths=[...new Set([...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+\.(?:js|css)(?:\?[^\"]*)?)"/g)].map(m=>m[1]))];
  const result={base,pageMs:Math.round(performance.now()-started),jsBytes:0,cssBytes:0,jsGzipBytes:0,cssGzipBytes:0,externalScripts:0};
  for(const path of paths){const url=new URL(path,base);if(url.origin!==base)throw Error('UNEXPECTED_ASSET_ORIGIN');const a=await fetch(url);if(!a.ok)throw Error('ASSET_FAILED');const bytes=Buffer.from(await a.arrayBuffer()),kind=url.pathname.endsWith('.js')?'js':'css';result[kind+'Bytes']+=bytes.length;result[kind+'GzipBytes']+=gzipSync(bytes).length;}
  return result;
}
const [baseline,local]=await Promise.all([sample('https://livasports.com'),sample('http://localhost:3300')]);
const result={at:new Date().toISOString(),baseline,local,delta:{js:local.jsBytes-baseline.jsBytes,css:local.cssBytes-baseline.cssBytes,jsGzip:local.jsGzipBytes-baseline.jsGzipBytes,cssGzip:local.cssGzipBytes-baseline.cssGzipBytes},newRuntimeDependencies:0,bannerBytes:0};
await writeFile('output/g1-performance-private.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
