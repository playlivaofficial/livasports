// Explicitly reviewed Commons records; acquisition only, not automatic public registration.
import {mkdir,writeFile,access,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import sharp from 'sharp';
const reviewed=[
 ['bayern','FC_Bayern_München_logo_(2024).svg'],['mainz','1._FSV_Mainz_05_logo.svg'],
 ['euroleague','EuroLeague_logo.svg'],['ufc','UFC_logo.svg'],['peru-liga-1','Liga_1_(Peru)_logo.svg'],['la-liga','RGB_Logotipo_LALIGA_black.png'],['ligue-1','Ligue_1_2024_Logo.png'],
 ['dortmund','Borussia_Dortmund_logo.svg'],['schalke','FC_Schalke_04_Logo.svg'],['hamburg','Hamburger_SV_logo.svg'],
 ['america-cali-wordmark','América_de_Cali_wordmark.svg'],
];
const sha=b=>createHash('sha256').update(b).digest('hex');
await mkdir('output/v3-source-audit/identity-review',{recursive:true});
const records=await readFile('output/v3-source-audit/identity-review/acquired.json','utf8').then(JSON.parse,error=>{if(error.code==='ENOENT')return [];throw error;});
for(const [id,file] of reviewed){
 if(await access('public/sports-identities/'+id+'.png').then(()=>true,()=>false))continue;
 await new Promise(resolve=>setTimeout(resolve,2000));
 const source='https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(file);
 const response=await fetch(source,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error(id+':PAGE_HTTP_'+response.status);
 const html=await response.text();if(html.length>2000000)throw Error('PAGE_TOO_LARGE');const $=load(html);
 if(!$('.licensetpl').text().includes('public domain')&&!html.includes('PD-textlogo'))throw Error(id+':RIGHTS_CHANGED');
 const original=$('.fullImageLink a').first().attr('href');if(!original||new URL(original).hostname!=='upload.wikimedia.org')throw Error('ASSET_HOST');
 const image=await fetch(original,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!image.ok)throw Error(id+':IMAGE_HTTP_'+image.status);
 const bytes=Buffer.from(await image.arrayBuffer());if(bytes.length>100000)throw Error(id+':IMAGE_TOO_LARGE');
 if(file.endsWith('.svg')&&/<(?:script|foreignObject|image)\b|(?:href|src)\s*=\s*["'](?!#)|\bon\w+\s*=/i.test(bytes.toString()))throw Error('UNSAFE_SVG');
 const {data,info}=await sharp(bytes).resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
 const path='/sports-identities/'+id+'.png';await writeFile('public'+path,data);
 const record={id,path,width:info.width,height:info.height,source,original,sourceSha256:sha(bytes),sha256:sha(data)};records.push(record);console.log(JSON.stringify(record));
 await writeFile('output/v3-source-audit/identity-review/acquired.json',JSON.stringify(records,null,2));
}
await writeFile('output/v3-source-audit/identity-review/acquired.json',JSON.stringify(records,null,2));
