// Bounded two-source, read-only reconciliation; never publishes or calls paid APIs.
import {load} from 'cheerio';
import {mkdir,writeFile} from 'node:fs/promises';
const sources=[['community','https://en.wikipedia.org/wiki/2026_Categor%C3%ADa_Primera_A_season'],['official','https://dimayor.com.co/liga-betplay-dimayor/']];
const result={checkedAt:new Date().toISOString(),requests:0,sources:[]};
for(const [id,url] of sources){
 result.requests++;const response=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'LivaSports-SourceReview/3.0 (+https://livasports.com)'}});
 if(!response.ok)throw Error(id+'_HTTP_'+response.status);
 const html=await response.text();if(html.length>3000000)throw Error('SOURCE_TOO_LARGE');const $=load(html);
 const tables=$('table').toArray().map(table=>({rows:$(table).find('tr').toArray().map(tr=>$(tr).children('th,td').toArray().map(cell=>$(cell).text().replace(/\[.*?\]/g,'').replace(/\s+/g,' ').trim())),after:$(table).nextAll().slice(0,3).text().replace(/\s+/g,' ').trim().slice(0,250)})).filter(table=>table.rows.some(row=>row.some(cell=>cell==='Deportivo Cali'||cell.endsWith(' Deportivo Cali')))&&table.rows.length>=20&&table.rows.length<=25);
 result.sources.push({id,url,status:response.status,revision:id==='community'?html.match(/oldid=(\d+)/)?.[1]??null:null,tables});
}
await mkdir('output/v3-source-audit/colombia-recheck',{recursive:true});await writeFile('output/v3-source-audit/colombia-recheck/tables.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
