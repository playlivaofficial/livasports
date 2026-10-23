import assert from 'node:assert/strict';

/** Real HTTP boundary + real PostgreSQL, but deliberately synthetic facts. Never contacts a sports source. */
export async function runOwnerAcceptance({origin,ownerKey,db}){
 assert.equal(origin,'http://localhost:3351');
 const passed=[];let cookie='';
 async function request(path,body,status=200,options={}){
  const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:origin,'Sec-Fetch-Site':'same-origin',...(cookie?{Cookie:cookie}:{}),...options.headers},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,status,`${path} ${body?.action??'GET'} status`);return response;
 }
 async function mutate(path,body,status=200){const response=await request(path,body,status);return response.json();}
 for(const path of ['/api/owner/sports','/api/owner/news'])await request(path,null,401);
 passed.push('Anonymous reads blocked');
 const login=await request('/api/owner/preview',{action:'login',key:ownerKey});
 const setCookie=login.headers.get('set-cookie');assert.ok(setCookie);for(const flag of ['HttpOnly','Secure','SameSite=Strict'])assert.ok(setCookie.includes(flag));cookie=setCookie.split(';')[0];
 assert.equal((await (await request('/api/owner/preview')).json()).authorized,true);passed.push('Actual Owner login + signed secure cookie');
 await request('/api/owner/sports',{action:'review'},403,{headers:{Origin:'https://untrusted.invalid'}});passed.push('Cross-origin write rejected');
 const snapshot={schemaVersion:1,competitionId:'premier-league',sport:'football',season:'2026/27',stage:'Synthetic acceptance only',sourceId:'openfootball',sourceUrl:'https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/en.1.json',observedAt:'2026-09-20',retrievedAt:new Date().toISOString(),mode:'historical',entities:[{id:'qa-club-a',name:'SYNTHETIC QA Club A',kind:'club'},{id:'qa-club-b',name:'SYNTHETIC QA Club B',kind:'club'}],tables:[],events:[{id:'qa-match-1',stage:'Synthetic acceptance only',homeId:'qa-club-a',awayId:'qa-club-b',start:'2026-09-18T12:00:00Z',status:'completed',scores:{home:1,away:0}}]};
 const path='/api/owner/sports',key='premier-league:2026/27';
 let record=(await mutate(path,{action:'create',key,revision:0,draft:snapshot})).record;
 assert.equal(record.revision,1);assert.equal(record.published,null);
 await mutate(path,{action:'publish',key,revision:1},409);passed.push('Publication before review blocked');
 await mutate(path,{action:'create',key,revision:0,draft:snapshot});
 assert.equal((await db.query('SELECT count(*) FROM sports_snapshot_audit')).rows[0].count,'1');passed.push('Import idempotency');
 const changed=structuredClone(snapshot);changed.events[0].scores.home=2;
 record=(await mutate(path,{action:'save',key,revision:1,draft:changed})).record;assert.equal(record.revision,2);
 await mutate(path,{action:'review',key,revision:2},400);
 record=(await mutate(path,{action:'review',key,revision:2,confirmed:true})).record;assert.equal(record.reviewedRevision,2);
 record=(await mutate(path,{action:'publish',key,revision:2})).record;assert.equal(record.published.events[0].scores.home,2);passed.push('Save → review → publish');
 const publicPath='/en/sports/football/premier-league';
 assert.ok((await (await request(publicPath)).text()).includes('SYNTHETIC QA Club A'));passed.push('Publication reaches server-rendered public route');
 const altered=structuredClone(changed);altered.events[0].scores.home=3;
 const race=()=>fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'Sec-Fetch-Site':'same-origin',Cookie:cookie},body:JSON.stringify({action:'save',key,revision:2,draft:altered})});
 const racing=await Promise.all([race(),race()]);assert.deepEqual(racing.map(response=>response.status).sort(),[200,409]);
 assert.equal((await racing.find(response=>response.status===200).json()).record.published.events[0].scores.home,2);passed.push('Concurrent edit conflict + published version preserved');
 record=(await mutate(path,{action:'archive',key,revision:3})).record;
 assert.equal(record.archived,true);assert.ok(record.published);
 assert.ok(!(await (await request(publicPath)).text()).includes('SYNTHETIC QA Club A'));passed.push('Immediate unpublish + canonical route preserved');
 const rows=(await db.query('SELECT action FROM sports_snapshot_audit ORDER BY id')).rows.map(row=>row.action);
 assert.deepEqual(rows,['create','save','review','publish','save','archive']);passed.push('Exact durable audit history');
 await db.query('BEGIN');await db.query("UPDATE sports_snapshots SET archived=false WHERE snapshot_key=$1",[key]);await db.query('ROLLBACK');
 assert.equal((await db.query('SELECT archived FROM sports_snapshots WHERE snapshot_key=$1',[key])).rows[0].archived,true);passed.push('Transaction rollback preserves publication state');
 const tr=value=>({en:value,es:value,pt:value});
 const draft={slug:'synthetic-ci-news-acceptance',country:'international',competition:'nba',sport:'basketball',title:tr('SYNTHETIC CI article — not real news'),summary:tr('Synthetic acceptance content for an isolated database only. This is not a sports report.'),body:tr('This synthetic article tests the reviewed publication workflow and must never enter the production database. No result or current event is asserted.'),sourceName:'Synthetic QA source',sourceUrl:'https://www.nba.com/news/synthetic-ci-acceptance-only',sourcePublishedOn:new Date().toISOString().slice(0,10),image:'none',imageCaption:tr(''),featured:true};
 const news='/api/owner/news',slug=draft.slug;
 draft.originalLanguage='en';
 draft.translationReview=Object.fromEntries(['en','es','pt'].map(language=>[language,{state:'pending',reviewedAt:null}]));
 await mutate(news,{action:'create',slug,revision:0,draft});await mutate(news,{action:'publish',slug,revision:1},409);
 await mutate(news,{action:'review',slug,revision:1,confirmed:true});await mutate(news,{action:'publish',slug,revision:1});
 for(const locale of ['en','mx','br'])assert.ok((await (await request('/'+locale)).text()).includes('SYNTHETIC CI article'));
 const publishedNews=(await (await request(news)).json()).records.find(item=>item.slug===slug);
 for(const language of ['en','es','pt'])assert.equal(publishedNews.published.translationReview[language].reviewedAt,publishedNews.published.verifiedAt);
 passed.push('Three-language reviewed article survives PostgreSQL timestamp round-trip and reaches every homepage');
 await mutate(news,{action:'archive',slug,revision:1});
 assert.ok(!(await (await request('/en')).text()).includes('SYNTHETIC CI article'));passed.push('Article unpublish removes homepage placement');
 const reload=await (await request(path)).json();assert.equal(reload.records[0].archived,true);passed.push('State survives independent HTTP/database connections');
 const logout=await request('/api/owner/preview',{action:'logout'});assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);cookie='';await request(path,null,401);passed.push('Logout and anonymous blocking');
 return {at:new Date().toISOString(),environment:'isolated local PostgreSQL',syntheticOnly:true,realHttp:true,productionConnections:0,providerRequests:0,passed};
}
