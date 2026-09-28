/** Bounded public HTML verification. No credentials, cookies, provider calls or mutations. */
import {readFile,writeFile} from 'node:fs/promises';
import {load} from 'cheerio';
const report=JSON.parse(await readFile('output/seo-ctr/measurement-report.json','utf8'));
const before=JSON.parse(await readFile('output/seo-ctr/before-2026-09-28T06-27-20.856Z.json','utf8'));
const paths=[...new Set([...report.experiments.map(e=>new URL(e.page).pathname),
  ...before.priorities.slice(0,2).map(p=>new URL(p.canonical_url).pathname),
  '/br/time/sao-paulo-245327df26f2446c','/br/futebol?competition=brasileirao-serie-a','/br','/en','/mx',
  new URL(before.pages.find(p=>p.url.includes('losc')).url).pathname])];
const origin=process.argv.find(a=>a.startsWith('--origin='))?.slice(9)||'https://livasports.com';
if(!['https://livasports.com','http://localhost:3302'].includes(origin))throw Error('UNAPPROVED_QA_ORIGIN');
const baselineMode=process.argv.includes('--baseline');
const baseline=baselineMode?null:JSON.parse(await readFile('output/seo-ctr/render-baseline.json','utf8'));
const pages=[];
for(const path of paths){
  const response=await fetch(origin+path,{redirect:'manual',headers:{'user-agent':'LivaSportsSeoAudit/1.0'}}),$=load(await response.text());
  const evidence={path,status:response.status,title:$('title').text(),description:$('meta[name="description"]').attr('content'),
    canonical:$('link[rel="canonical"]').attr('href'),robots:$('meta[name="robots"]').attr('content'),h1:$('h1').text(),
    hreflang:$('link[hreflang]').map((_,e)=>({lang:$(e).attr('hreflang'),href:$(e).attr('href')})).get(),
    schemaTypes:$('script[type="application/ld+json"]').map((_,e)=>{const data=JSON.parse($(e).text());return data['@type']??data['@graph']?.map(r=>r['@type'])??'graph';}).get(),
    contextLinks:$('.growth-context-links a').map((_,e)=>$(e).attr('href')).get()};
  const original=baseline?.pages.find(p=>p.path===path),experiment=report.experiments.find(e=>new URL(e.page).pathname===path);
  const faults=[];
  if(response.status!==200)faults.push('HTTP');
  if(!evidence.h1||!evidence.canonical||!evidence.description)faults.push('IDENTITY_METADATA');
  if(original){
    for(const field of ['canonical','robots','hreflang','h1','schemaTypes'])if(JSON.stringify(original[field])!==JSON.stringify(evidence[field]))faults.push(field);
    if(evidence.title!==(experiment?.newTitle??original.title))faults.push('title');
    if(evidence.description!==(experiment?.newDescription??original.description))faults.push('description');
  }
  pages.push({...evidence,faults});
}
const result={origin,capturedAt:new Date().toISOString(),pages,pass:pages.every(p=>p.faults.length===0)};
await writeFile(`output/seo-ctr/${baselineMode?'render-baseline':origin.includes('localhost')?'render-local':'render-production'}.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({origin,pass:result.pass,pages:pages.map(p=>({path:p.path,status:p.status,faults:p.faults,contextLinks:p.contextLinks.length}))}));
if(!result.pass)process.exitCode=1;
