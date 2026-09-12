import {writeFile} from 'node:fs/promises';
async function sample(base){const started=performance.now(),response=await fetch(base+'/br'),html=await response.text();if(!response.ok)throw Error('PAGE_FAILED');const pageMs=Math.round(performance.now()-started);
  const paths=[...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]))];let decodedScriptBytes=0;
  for(const path of paths){const url=new URL(path,base);if(url.origin!==base)throw Error('UNEXPECTED_SCRIPT_ORIGIN');const r=await fetch(url);if(!r.ok)throw Error('SCRIPT_FAILED');decodedScriptBytes+=(await r.arrayBuffer()).byteLength;}
  return {base,status:response.status,pageMs,scriptCount:paths.length,decodedScriptBytes};
}
const [m7Production,m8Local]=await Promise.all([sample('https://livasports.com'),sample('http://localhost:3300')]);
const result={at:new Date().toISOString(),m7Production,m8Local,deltaBytes:m8Local.decodedScriptBytes-m7Production.decodedScriptBytes,deltaPercent:100*(m8Local.decodedScriptBytes/m7Production.decodedScriptBytes-1),newRuntimeDependencies:0};
await writeFile('output/m8-performance-private.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
