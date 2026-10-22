import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const url=new URL('https://en.wikipedia.org/w/api.php');url.search=new URLSearchParams({action:'query',format:'json',formatversion:'2',prop:'revisions',revids:'1381387526',rvprop:'ids|timestamp|content',rvslots:'main'});
const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'LivaSports-SourceReview/3.0 (+https://livasports.com)'}});assert.equal(response.status,200);
const raw=await response.text();assert.ok(raw.length<1000000);const json=JSON.parse(raw),page=json.query.pages[0];assert.equal(page.title,'2026 Liga DIMAYOR');assert.equal(page.revisions[0].revid,1381387526);
await mkdir('output/v3-source-audit/colombia-recheck',{recursive:true});await writeFile('output/v3-source-audit/colombia-recheck/revision.json',raw);
const text=page.revisions[0].slots.main.content;console.log(JSON.stringify({title:page.title,revision:page.revisions[0].revid,timestamp:page.revisions[0].timestamp,sections:text.match(/<section[^>]+>/g),finalizacion:text.slice(text.indexOf('|section=Final'),text.indexOf('|section=Final')+900)}));
