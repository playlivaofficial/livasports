import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const base=process.argv[2]??'http://localhost:3300';if(!['http://localhost:3300','https://livasports.com'].includes(base))throw Error('QA_SCOPE');
const {paths}=JSON.parse(await readFile('output/g1-language-sports-sample.json','utf8'));
const phase=base.startsWith('https')?'production':'local',checks=[];
const check=(name,pass)=>{checks.push({name,pass});if(!pass)throw Error(name);};
const b=await browserQA();let p;const info=console.info;console.info=()=>{};
await mkdir('output/g1-evidence',{recursive:true});
try{
  p=await b.newPage();await p.c.send('Network.setBlockedURLs',{urls:['*://api.sportmonks.com/*','*://api.oddspapi.io/*','*://*.bannerflow.net/*','*://*.bannerflow.com/*','*://record.betsson.bet.br/*']});
  await p.c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(let i=0;i<paths.length;i++)for(const width of [375,390,430,768,1440]){
    await p.viewport(width,width===1440?1000:844);await p.evaluate('window.__qaOldDocument=true');await p.c.send('Page.navigate',{url:base+paths[i]});
    await p.wait('!window.__qaOldDocument && document.readyState==="complete" && !!document.querySelector(".lineup-team")',30000);await delay(400);
    await p.key('Tab');check(`keyboard skip focus ${i} ${width}`,await p.evaluate(`document.activeElement?.classList.contains('skip-link')&&getComputedStyle(document.activeElement).outlineStyle!=='none'`));
    for(let tab=0;tab<12;tab++){if(await p.evaluate(`document.activeElement?.matches('.language-picker summary')`))break;await p.key('Tab');}
    check(`keyboard language control ${i} ${width}`,await p.evaluate(`document.activeElement?.matches('.language-picker summary')`));
    await p.key('Enter');check(`keyboard opens language list ${i} ${width}`,await p.evaluate(`document.querySelector('.language-picker').open`));
    await p.key('Tab');check(`keyboard reaches language button ${i} ${width}`,await p.evaluate(`document.activeElement?.matches('.language-picker button')`));
    await p.key('Escape');check(`Escape closes and restores focus ${i} ${width}`,await p.evaluate(`!document.querySelector('.language-picker').open&&document.activeElement?.matches('.language-picker summary')`));
    for(const id of ['statistics','lineups']){
      await p.click(`.match-tabs a[href="#${id}"]`);await delay(300);
      check(`active section ${i} ${width} ${id}`,await p.evaluate(`document.querySelector('.match-tabs a[href="#${id}"]').getAttribute('aria-current')==='location'`));
      check(`heading visible below sticky nav ${i} ${width} ${id}`,await p.evaluate(`document.getElementById('${id}').getBoundingClientRect().top>=document.querySelector('.match-tabs').getBoundingClientRect().bottom-1`));
      const layout=await p.screenshot(`output/g1-evidence/language-${phase}-completed-${i}-${id}-${width}.png`);
      check(`no overflow ${i} ${width} ${id}`,!layout.overflow);check(`images loaded ${i} ${width} ${id}`,layout.brokenImages===0);
    }
    check(`reduced motion ${i} ${width}`,await p.evaluate(`getComputedStyle(document.documentElement).scrollBehavior==='auto'`));
  }
  check('no browser runtime errors',p.metrics.errors.length===0);check('no server errors',p.metrics.failed.length===0);check('no provider requests',p.metrics.providers===0);
  await writeFile(`output/g1-language-${phase}-a11y-private.json`,JSON.stringify({status:'PASS',checks,providerRequests:0}));
  console.log(JSON.stringify({status:'PASS',phase,checks:checks.length,providerRequests:0}));
}catch(error){console.error('LANGUAGE_A11Y_FAILED: '+error.message);process.exitCode=1;if(p)await p.screenshot(`output/g1-evidence/language-${phase}-a11y-failure.png`).catch(()=>{});}
finally{console.info=info;await b.close();}
