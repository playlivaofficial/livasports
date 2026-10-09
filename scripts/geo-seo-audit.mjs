// Bounded, public HTTP-only audit. No credentials, ingestion, provider or mutation calls.
import {load} from 'cheerio';
import {SaxesParser} from 'saxes';
const origin=process.argv[2]??'https://livasports.com';
if(!/^https:\/\/livasports\.com$|^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))throw Error('AUDIT_ORIGIN_NOT_ALLOWED');
const production='https://livasports.com',cache=new Map();let requests=0;
async function get(path){
 if(cache.has(path))return cache.get(path);
 if(++requests>75)throw Error('AUDIT_REQUEST_CAP');
 const promise=(async()=>{const started=performance.now();try{const r=await fetch(origin+path,{redirect:'manual',headers:{'user-agent':'Googlebot'},signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.text(),location:r.headers.get('location'),cache:r.headers.get('x-vercel-cache'),ms:Math.round(performance.now()-started)};}catch{return {status:0,body:'',location:null,cache:null,ms:Math.round(performance.now()-started)};}})();cache.set(path,promise);return promise;
}
const findings=[],records=[],submitted=new Set(),sitemapCounts={};
const primary=await get('/sitemap.xml'),index=await get('/sports-sitemaps.xml');
if(index.status!==200)findings.push({path:'/sports-sitemaps.xml',problem:'SITEMAP_INDEX_HTTP',status:index.status});
const validateXml=(path,body)=>{const parser=new SaxesParser();let invalid=false;parser.on('error',()=>{invalid=true;});try{parser.write(body).close();}catch{invalid=true;}if(invalid)findings.push({path,problem:'INVALID_SITEMAP_XML'});};
validateXml('/sports-sitemaps.xml',index.body);
const parseXml=body=>load(body,{xmlMode:true});
const children=parseXml(index.body)('sitemap > loc').map((_,el)=>parseXml(index.body)(el).text()).get();
for(const [path,data] of [['/sitemap.xml',primary],...await Promise.all(children.map(async url=>{if(new URL(url).origin!==production)throw Error('FOREIGN_SITEMAP');const path=new URL(url).pathname;return [path,await get(path)];}))]){
 if(data.status!==200)findings.push({path,problem:'SITEMAP_HTTP',status:data.status});
 validateXml(path,data.body);
 const xml=parseXml(data.body);xml('url > loc').each((_,el)=>{const url=xml(el).text();submitted.add(url);const locale=new URL(url).pathname.split('/')[1];sitemapCounts[locale]=(sitemapCounts[locale]??0)+1;});
}
const rows=[];
const locales=['mx','co','pe','en','br'];
for(const locale of locales){
 const football=locale==='en'?'football':locale==='br'?'futebol':'futbol',live=locale==='en'?'live':locale==='br'?'ao-vivo':'en-vivo',today=locale==='en'?'matches/today':locale==='br'?'jogos/hoje':'partidos/hoy';
 rows.push({path:`/${locale}`,family:'home'},{path:`/${locale}/${football}`,family:'football'},{path:`/${locale}/${live}`,family:'live'},{path:`/${locale}/${today}`,family:'today'});
}
for(const [locale,competition] of [['mx','liga-mx'],['co','colombia-primera-a'],['pe','peru-liga-1']]){
 rows.push(...['','&tab=standings','&tab=results&p=2'].map(suffix=>({path:`/${locale}/futbol?competition=${competition}${suffix}`,family:'competition'})));
 const home=load((await get(`/${locale}`)).body),match=home('a[href]').map((_,e)=>home(e).attr('href')).get().find(h=>h.startsWith(`/${locale}/partido/`));
 if(match){rows.push({path:match,family:'match'});const html=load((await get(match)).body),team=html('a[href]').map((_,e)=>html(e).attr('href')).get().find(h=>h.startsWith(`/${locale}/equipo/`));if(team)rows.push({path:team,family:'team'});}
 rows.push({path:`/${locale}/futbol?q=club`,family:'search',noindex:true},{path:`/${locale}/partido/not-a-fixture-0000000000000000`,family:'invalid',status:404});
}
for(const row of rows){
 try{const response=await get(row.path),$=load(response.body),canonical=$('link[rel=canonical]').attr('href')??'',title=$('title').first().text(),h1=$('h1').first().text(),description=$('meta[name=description]').attr('content')??'',robots=[$('meta[name=robots]').attr('content'),$('meta[name=googlebot]').attr('content')].join(','),locale=row.path.split('/')[1],tag={mx:'es-MX',co:'es-CO',pe:'es-PE',br:'pt-BR',en:'en'}[locale];
 const alternates=$('link[hreflang]').map((_,e)=>({lang:$(e).attr('hreflang'),href:$(e).attr('href')})).get();
 const schemas=[];let schemaError=false;$('script[type="application/ld+json"]').each((_,el)=>{try{schemas.push(JSON.parse($(el).text()));}catch{schemaError=true;}});
 const indexed=!/noindex/i.test(robots),problems=[];
 if(response.status!==(row.status??200))problems.push('HTTP_STATUS');
 if(row.family!=='invalid'){
  if(!title||!description||!h1)problems.push('MISSING_CONTENT_METADATA');
  if(!canonical)problems.push('CANONICAL_MISSING');
  if(row.noindex&&indexed)problems.push('SEARCH_INDEXABLE');
  if(indexed&&!alternates.some(a=>a.lang===tag&&a.href===canonical))problems.push('SELF_HREFLANG_MISSING');
  if($('html').attr('lang')!==tag)problems.push('HTML_LANGUAGE');
  if(schemaError)problems.push('INVALID_JSON_LD');
  if(indexed&&row.family!=='search'&&!schemas.length)problems.push('NO_STRUCTURED_DATA');
  if(['home','football','live','today'].includes(row.family)&&canonical!==production+row.path)problems.push('CANONICAL_MISMATCH');
 }
 if(problems.length)findings.push({path:row.path,problems,status:response.status});
 records.push({path:row.path,family:row.family,status:response.status,title,h1,description,canonical,indexed,htmlLang:$('html').attr('lang'),alternates,schemas:schemas.flat().map(s=>s['@type']),inSitemap:submitted.has(canonical),cache:response.cache,ms:response.ms,problems});
 }catch{findings.push({path:row.path,problem:'HTTP_AUDIT_FAILED'});}
}
// Reciprocal regional signals on all four boards and one real entity, not just self alternates.
const reciprocal=[];
for(const record of records.filter(r=>r.indexed&&['home','football','live','today'].includes(r.family)||r===records.find(p=>p.family==='match'))){
 for(const alt of record.alternates.filter(a=>a.lang!=='x-default')){
  const url=new URL(alt.href);if(url.origin!==production){findings.push({path:record.path,problem:'FOREIGN_HREFLANG'});continue;}
  const response=await get(url.pathname+url.search),$=load(response.body),back=$(`link[hreflang="${record.htmlLang}"]`).attr('href');
  if(response.status!==200||back!==record.canonical)findings.push({path:record.path,alternate:url.pathname+url.search,status:response.status,problem:'HREFLANG_NOT_RECIPROCAL'});
  reciprocal.push({path:record.path,alternate:url.pathname+url.search,pass:response.status===200&&back===record.canonical});
 }
}
const duplicateChecks=[];
for(const locale of ['mx','co','pe']){
 const path=`/${locale}/futbol?utm_source=seo-audit`,r=await get(path),$=load(r.body),canonical=$('link[rel=canonical]').attr('href');
 duplicateChecks.push({path,status:r.status,canonical});if(r.status!==200||canonical!==production+`/${locale}/futbol`)findings.push({path,problem:'TRACKING_CANONICAL'});
 const match=records.find(r=>r.family==='match'&&r.path.startsWith('/'+locale+'/'));
 if(match){const wrong=match.path.replace(/\/partido\/.*-([a-f0-9]{16})$/,'/partido/wrong-slug-$1'),redirect=await get(wrong);duplicateChecks.push({path:wrong,status:redirect.status,location:redirect.location});if(![307,308].includes(redirect.status)||!redirect.location?.endsWith(match.path))findings.push({path:wrong,problem:'CANONICAL_SLUG_REDIRECT'});}
}
const robots=await get('/robots.txt');
console.log(JSON.stringify({generatedAt:new Date().toISOString(),origin,requests,submitted:submitted.size,sitemapCounts,robots:{status:robots.status,allowsPublic:/Allow: \/\s/.test(robots.body),sitemapsDeclared:robots.body.includes('/sitemap.xml')&&robots.body.includes('/sports-sitemaps.xml')},records,reciprocal,duplicateChecks,findings,providerRequests:0},null,2));
process.exitCode=findings.length?1:0;
