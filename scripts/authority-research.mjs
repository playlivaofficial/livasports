// Read-only public research aid. No accounts, cookies, contact submission or private addresses.
import {load} from 'cheerio';
const sites=process.argv.slice(2);
for(let i=0;i<sites.length;i+=4)await Promise.all(sites.slice(i,i+4).map(async site=>{
 try{const response=await fetch(site,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'LivaSportsEditorialResearch/1.0'}});if(!response.ok){console.log(JSON.stringify({site,status:response.status}));return;}
 const $=load(await response.text()),all=[];const seen=new Set();
 $('a[href]').each((_,a)=>{let url;try{url=new URL($(a).attr('href'),response.url).href;}catch{return;}const title=$(a).text().replace(/\s+/g,' ').trim();if(!seen.has(url)){seen.add(url);all.push({title,url});}});
 const contact=all.filter(a=>/contato|contact|expediente|fale.conosco|quem.somos|sobre.n[oó]s/i.test(a.title+' '+a.url));
 const articles=all.filter(a=>a.title.length>45&&a.title.length<210&&new URL(a.url).hostname===new URL(response.url).hostname&&!/privacidade|cookie|termos|aposta|casino|b[oô]nus/i.test(a.title)).slice(0,5);
 console.log(JSON.stringify({site,url:response.url,title:$('title').text(),articles,contact:contact.slice(0,5)}));
 }catch{console.log(JSON.stringify({site,status:'UNAVAILABLE'}));}
}));
