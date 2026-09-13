// Five-width QA for the sports visual release; no portal or outbound actions.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const base=process.argv[2]??'http://localhost:3300';
if(!['http://localhost:3300','https://livasports.com'].includes(base))throw Error('QA_SCOPE');
const phase=base.startsWith('https')?'production':'local';
const extra=JSON.parse(await readFile('output/g1-sports-paths-private.json','utf8')).paths;
const paths=[['home','/br'],['mx','/mx'],['match','/br/jogo/flamengo-x-corinthians-48611d6f0a484f87'],['team','/br/time/flamengo-b9c4f07b09aa447a'],['player','/br/jogador/agustin-rossi-27e4e63b6336469b'],...extra];
const b=await browserQA(),checks=[],layouts=[];let p,adRequests=0;
const check=(name,pass)=>{checks.push({name,pass});if(!pass)throw Error(name);};
await mkdir('output/g1-evidence',{recursive:true});
try{
  p=await b.newPage();
  p.c.on('Network.requestWillBeSent',e=>{if(/bannerflow|record\.betsson/.test(e.request.url))adRequests++;});
  await p.c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const [name,path] of paths){
    for(const width of [375,390,430,768,1440]){
      await p.viewport(width,width===1440?1000:844);await p.navigate(base+path);await delay(500);
      const layout=await p.screenshot(`output/g1-evidence/${phase}-${name}-${width}.png`);layouts.push({name,...layout});
      check(name+' layout '+width,!layout.overflow&&layout.brokenImages===0);
      check(name+' primary touch targets '+width,await p.evaluate(`[...document.querySelectorAll('.nav-link,.locale-link,.profile-tabs a,.match-tabs a,.match-share')].filter(e=>e.getBoundingClientRect().width>0).every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44})`));
      check(name+' no publisher frame '+width,await p.evaluate(`!document.querySelector('iframe[src*="/api/commercial/creative"]')`));
      if(name==='home'||name==='mx')check(name+' 34 competition links '+width,await p.evaluate(`document.querySelectorAll('.competition-tab[href^="#competition-"]').length===34`));
    const nav=await p.evaluate(`document.querySelector('.profile-tabs a:nth-child(2),.match-tabs a:nth-child(2)')?.getAttribute('href')`);
    if(nav){
      await p.click('.profile-tabs a:nth-child(2),.match-tabs a:nth-child(2)');await delay(300);
      check(name+' active section navigation '+width,await p.evaluate(`[...document.querySelectorAll('.profile-tabs a,.match-tabs a')].some(a=>a.getAttribute('href')===${JSON.stringify(nav)}&&a.getAttribute('aria-current')==='location')`));
      check(name+' section heading clears sticky navigation '+width,await p.evaluate(`(()=>{const section=document.querySelector(${JSON.stringify(nav)});const tabs=document.querySelector('.profile-tabs,.match-tabs');return section&&tabs&&section.getBoundingClientRect().top>=tabs.getBoundingClientRect().bottom-1})()`));
    }
    }
    check(name+' reduced motion',await p.evaluate(`getComputedStyle(document.documentElement).scrollBehavior==='auto'`));
    await p.key('Tab');
    check(name+' keyboard focus visible',await p.evaluate(`document.activeElement!==document.body&&getComputedStyle(document.activeElement).outlineStyle!=='none'`));
    if(name==='finished'){
      for(const id of ['statistics','lineups']){
        await p.evaluate(`document.getElementById(${JSON.stringify(id)})?.scrollIntoView({block:'start'})`);
        await p.screenshot(`output/g1-evidence/${phase}-finished-${id}.png`);
      }
    }
  }
  check('no runtime or provider failures',p.metrics.errors.length===0&&p.metrics.failed.length===0&&p.metrics.providers===0);
  check('no operator ad requests',adRequests===0);
  await writeFile(`output/g1-${phase}-sports-visual-private.json`,JSON.stringify({at:new Date().toISOString(),status:'PASS',checks,layouts,metrics:p.metrics,adRequests},null,2));
  console.log(JSON.stringify({status:'PASS',checks:checks.length,pages:paths.length,maxCLS:Math.max(...layouts.map(x=>x.cls??0)),adRequests}));
}catch(error){console.error(error.message);process.exitCode=1;if(p)await p.screenshot(`output/g1-evidence/${phase}-failure.png`).catch(()=>{});}
finally{await b.close();}
