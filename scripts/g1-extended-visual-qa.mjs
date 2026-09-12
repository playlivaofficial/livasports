import {readFile,writeFile} from 'node:fs/promises';
import {browserQA,delay} from './browser-qa-driver.mjs';
const base=process.argv[2]??'http://localhost:3300';
if(!['http://localhost:3300','https://livasports.com'].includes(base))throw Error('QA_SCOPE');
const phase=base.startsWith('https')?'production':'local';
const {paths}=JSON.parse(await readFile('output/g1-commercial-qa-private.json','utf8'));
const b=await browserQA(),checks=[],layouts=[];let p;
const check=(name,pass)=>{checks.push({name,pass});if(!pass)throw Error(name);};
try{
  p=await b.newPage();
  await p.c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const [name,path] of paths){
    for(const width of [375,390,430,768,1440]){
      await p.viewport(width,width===1440?1000:844);await p.navigate(base+path);await delay(300);
      const layout=await p.screenshot(`output/g1-evidence/${phase}-${name}-${width}.png`);layouts.push({name,...layout});
      check(name+' layout '+width,!layout.overflow&&layout.brokenImages===0);
      check(name+' touch targets '+width,await p.evaluate(`[...document.querySelectorAll('.nav-link,.locale-link,.profile-tabs a,.match-tabs a,.match-share,.slip-trigger')].filter(e=>e.getBoundingClientRect().width>0).every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44})`));
    }
    check(name+' reduced motion',await p.evaluate(`getComputedStyle(document.documentElement).scrollBehavior==='auto'`));
    await p.key('Tab');
    check(name+' keyboard focus visible',await p.evaluate(`document.activeElement!==document.body&&getComputedStyle(document.activeElement).outlineStyle!=='none'`));
    const nav=await p.evaluate(`document.querySelector('.profile-tabs a:nth-child(2),.match-tabs a:nth-child(2)')?.getAttribute('href')`);
    if(nav){await p.click('.profile-tabs a:nth-child(2),.match-tabs a:nth-child(2)');await delay(200);check(name+' active section navigation',await p.evaluate(`document.querySelector('a[href=${JSON.stringify(nav)}][aria-current=location]')!==null`));}
    if(name==='finished'){
      await p.evaluate(`document.querySelector('#statistics')?.scrollIntoView({block:'start'})`);
      await p.screenshot(`output/g1-evidence/${phase}-finished-statistics.png`);
      await p.evaluate(`document.querySelector('#lineups')?.scrollIntoView({block:'start'})`);
      await p.screenshot(`output/g1-evidence/${phase}-finished-lineups.png`);
    }
  }
  check('no runtime or provider failures',p.metrics.errors.length===0&&p.metrics.failed.length===0&&p.metrics.providers===0);
  await writeFile(`output/g1-${phase}-extended-visual-private.json`,JSON.stringify({at:new Date().toISOString(),status:'PASS',checks,layouts,metrics:p.metrics},null,2));
  console.log(JSON.stringify({status:'PASS',checks:checks.length,pages:paths.length}));
}catch(error){console.error(error.message);process.exitCode=1;if(p)await p.screenshot(`output/g1-evidence/${phase}-extended-failure.png`).catch(()=>{});}finally{await b.close();}
