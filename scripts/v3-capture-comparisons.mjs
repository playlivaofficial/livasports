import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {browserQA,delay} from './browser-qa-driver.mjs';
const dir=process.argv[2]??'output/v3-qa/acceptance-2026-10-22/sports-app',b=await browserQA();
try{const page=await b.newPage();await page.c.send('Page.navigate',{url:pathToFileURL(resolve(dir+'/review.html')).href});await page.wait('document.readyState==="complete" && document.querySelectorAll("section").length===3',30000);
 for(const [index,name,width] of [[0,'light',850],[1,'dark',850],[2,'desktop',1440]]){
  await page.viewport(width,1100);await page.evaluate(`document.querySelectorAll('section')[${index}].scrollIntoView({block:'start'})`);await delay(250);await page.screenshot(dir+'/comparison-'+name+'.png');
 }
}finally{await b.close();}
