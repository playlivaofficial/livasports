import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const baseline='8c35273729a62923900251d6712e6fb5b4d3955b';
const archive='e8319b934f7de19db4306b9f785fe75aee530703';
const protectedPaths=['db','src/affiliate','src/odds','src/slip','src/components/commercial','src/components/slip','src/components/match/PregameOdds.tsx','src/components/sports/OddsComparison.tsx','src/app/api','src/app/go','src/profiles/sponsor.ts','package.json','pnpm-lock.yaml','next.config.ts'];
const changed=execFileSync('git',['diff','--name-only',baseline,'--',...protectedPaths],{encoding:'utf8'}).trim();
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split(/\r?\n/);
const checks=[];
const check=(name,pass)=>checks.push({name,pass});
check('Protected implementation and dependency files match main baseline',!changed);
check('No untracked commercial implementation',!untracked.some(f=>protectedPaths.some(p=>f===p||f.startsWith(p+'/'))));
check('Publisher endpoint excluded from source',!existsSync('src/app/api/commercial/creative'));
const manifest=JSON.parse(readFileSync('.next/server/app-paths-manifest.json','utf8'));
check('Publisher endpoint excluded from build',!Object.keys(manifest).some(p=>p.includes('/commercial/creative')));
const archiveExists=spawnSync('git',['cat-file','-e',archive+'^{commit}']).status===0;
const ancestor=archiveExists?spawnSync('git',['merge-base','--is-ancestor',archive,'HEAD']):null;
check('Preserved commercial commit is outside release ancestry',!archiveExists||ancestor?.status===1);
for(const file of ['src/components/sports/M2SportsPage.tsx','src/components/sports/FixtureList.tsx','src/components/match/MatchCenter.tsx','src/components/profile/ProfilePage.tsx']){
 const before=execFileSync('git',['show',baseline+':'+file],{encoding:'utf8'});
 const after=readFileSync(file,'utf8');
 const slots=s=>[...s.matchAll(/<SponsoredSlot\b[^>]*\/>/g)].map(m=>m[0].replace(/\s+/g,' ')).sort();
 check('Existing slot declarations preserved: '+file,slots(before).length>0&&JSON.stringify(slots(before))===JSON.stringify(slots(after)));
}
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
const publicAssets=files('.next/static').filter(f=>/\.(js|css)$/.test(f));
check('Public build contains no new publisher sources',publicAssets.every(f=>!readFileSync(f,'utf8').includes('c.bannerflow.net/a/')));
const result={at:new Date().toISOString(),status:checks.every(c=>c.pass)?'PASS':'FAIL',baseline,archive,checks};
writeFileSync('output/g1-isolation-private.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
if(result.status!=='PASS')process.exitCode=1;
