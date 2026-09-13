import {writeFile,mkdir} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const base=process.argv[2]??'http://localhost:3300';
if(!['http://localhost:3300','https://livasports.com'].includes(base))throw Error('QA_SCOPE');
const phase=base.startsWith('https')?'production':'local';
const paths={br:['/br','/br/futebol','/br/ao-vivo','/br/jogos/hoje','/br/jogo/flamengo-x-corinthians-48611d6f0a484f87','/br/time/flamengo-b9c4f07b09aa447a','/br/jogador/agustin-rossi-27e4e63b6336469b'],
  mx:['/mx','/mx/futbol','/mx/en-vivo','/mx/partidos/hoy','/mx/partido/flamengo-x-corinthians-48611d6f0a484f87','/mx/equipo/flamengo-b9c4f07b09aa447a','/mx/jugador/agustin-rossi-27e4e63b6336469b'],
  en:['/en','/en/football','/en/live','/en/matches/today','/en/match/flamengo-x-corinthians-48611d6f0a484f87','/en/team/flamengo-b9c4f07b09aa447a','/en/player/agustin-rossi-27e4e63b6336469b']};
const tags={br:'pt-BR',mx:'es-MX',en:'en'},checks=[],layouts=[];
const check=(name,pass)=>{checks.push({name,pass});if(!pass)throw Error(name);};
const b=await browserQA();let p;
const info=console.info;console.info=()=>{};
await mkdir('output/g1-evidence',{recursive:true});
try{
  p=await b.newPage();
  // This QA exercises navigation only and never activates an outbound or embed.
  await p.c.send('Network.setBlockedURLs',{urls:['*://api.sportmonks.com/*','*://api.oddspapi.io/*','*://*.bannerflow.net/*','*://*.bannerflow.com/*','*://record.betsson.bet.br/*']});
  await p.c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const navigate=async path=>{await p.evaluate('window.__qaOldDocument=true');await p.c.send('Page.navigate',{url:base+path});await p.wait('!window.__qaOldDocument && document.readyState==="complete" && !!document.querySelector("main h1")',30000);await delay(400);};
  for(const [locale,routes] of Object.entries(paths))for(let index=0;index<routes.length;index++){
    const name=`${locale}-${index}`;
    for(const width of [375,390,430,768,1440]){
      await p.viewport(width,width===1440?1000:844);await navigate(routes[index]);
      const layout=await p.screenshot(`output/g1-evidence/language-${phase}-${name}-${width}.png`);layouts.push({name,...layout});
      check(`${name} ${width} no overflow`,!layout.overflow);check(`${name} ${width} images loaded`,layout.brokenImages===0);
      check(`${name} ${width} document language`,await p.evaluate(`document.documentElement.lang===${JSON.stringify(tags[locale])}`));
      check(`${name} ${width} accessible document`,await p.evaluate(`document.querySelectorAll('main').length===1&&document.querySelectorAll('h1').length===1&&!!document.querySelector('.skip-link[href^="#"]')`));
      check(`${name} ${width} 44px primary targets`,await p.evaluate(`[...document.querySelectorAll('.nav-link,.language-picker summary,.profile-tabs a,.match-tabs a,.match-share')].filter(e=>e.getBoundingClientRect().width>0).every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44})`));
      if(index<4)check(`${name} ${width} all competitions`,await p.evaluate(`document.querySelectorAll('.competition-tab[href^="#competition-"]').length===34`));
      if(locale==='en')check(`${name} ${width} English interface`,await p.evaluate(`!/(Voltar ao|Estatísticas|Escalações|Partidas|Próximo jogo|Perfil não|Futebol|Partidos de hoy|Volver al)/.test(document.querySelector('main').innerText)`));
      if(locale!=='en')check(`${name} ${width} no English sports UI`,await p.evaluate(`!/(Back to football|Back to matches|Loading football|Today’s matches|Match sections|Starting XI|Recent form)/.test(document.querySelector('main').innerText)`));
    }
    const seo=await p.evaluate(`({canonical:document.querySelector('link[rel="canonical"]')?.getAttribute('href'),languages:[...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(e=>e.hreflang)})`);
    check(`${name} canonical`,seo.canonical===`https://livasports.com${routes[index]}`);
    check(`${name} reciprocal hreflang`,['pt-BR','es-MX','en','x-default'].every(tag=>seo.languages.includes(tag)));
    console.log(JSON.stringify({phase,page:name,widths:5,status:'PASS'}));
  }
  // Real form submission verifies cookies and context; no sporting action is taken.
  for(const index of [0,1,2,3,4,5,6]){
    await navigate(paths.br[index]+'?view=recent#'+(index===5?'squad':index>=4?'statistics':'fixtures-content'));
    const originalStorage=await p.evaluate(`localStorage.getItem('livasports:guest-slip')`);
    // Opaque storage sentinel proves navigation does not erase or rewrite saved state.
    const marker=JSON.stringify({version:1,selections:[],qaPreservation:'language-only'});
    await p.evaluate(`localStorage.setItem('livasports:guest-slip',${JSON.stringify(marker)})`);
    for(const locale of ['en','mx','br']){
      await p.click('.language-picker summary');await p.click(`.language-picker button[value="${locale}"]`);
      await p.wait(`location.pathname===${JSON.stringify(paths[locale][index])}&&document.readyState==='complete'`,30000);await delay(500);
      check(`context ${index} ${locale}`,await p.evaluate(`location.search==='?view=recent'&&location.hash===${JSON.stringify('#'+(index===5?'squad':index>=4?'statistics':'fixtures-content'))}`));
      check(`saved state ${index} ${locale}`,await p.evaluate(`localStorage.getItem('livasports:guest-slip')===${JSON.stringify(marker)}`));
      const cookies=await p.c.send('Network.getCookies',{urls:[base]});const cookie=cookies.cookies.find(c=>c.name==='livasports_language');
      check(`preference cookie ${index} ${locale}`,cookie?.value===locale&&cookie?.httpOnly===true&&cookie?.sameSite==='Lax'&&cookie?.path==='/');
    }
    await p.evaluate(originalStorage===null?`localStorage.removeItem('livasports:guest-slip')`:`localStorage.setItem('livasports:guest-slip',${JSON.stringify(originalStorage)})`);
  }
  await navigate('/');check('manual preference overrides unknown root GEO',await p.evaluate(`location.pathname==='/br'`));
  await p.c.send('Network.deleteCookies',{name:'livasports_language',url:base});
  if(phase==='local'){await navigate('/');check('unknown local GEO defaults English',await p.evaluate(`location.pathname==='/en'`));}
  await p.c.send('Emulation.setScriptExecutionDisabled',{value:true});
  await p.c.send('Page.navigate',{url:base+'/en'});await delay(2500);
  await p.c.send('Emulation.setScriptExecutionDisabled',{value:false});
  check('server-rendered English content',await p.evaluate(`!!document.querySelector('main h1')&&document.documentElement.lang==='en'`));
  check('no browser runtime errors',p.metrics.errors.length===0);check('no failed server responses',p.metrics.failed.length===0);check('no provider requests',p.metrics.providers===0);
  await writeFile(`output/g1-language-${phase}-browser-private.json`,JSON.stringify({status:'PASS',checks,layouts,providerRequests:p.metrics.providers,runtimeErrors:p.metrics.errors.length},null,2));
  console.log(JSON.stringify({status:'PASS',phase,checks:checks.length,pages:21,widths:5,maxCLS:Math.max(...layouts.map(row=>row.cls??0)),providerRequests:0}));
}catch(error){console.error('LANGUAGE_QA_FAILED: '+error.message);process.exitCode=1;if(p)await p.screenshot(`output/g1-evidence/language-${phase}-failure.png`).catch(()=>{});}
finally{console.info=info;await b.close();}
