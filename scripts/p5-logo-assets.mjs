// Lossless-layout derivatives of the owner's approved artwork. No redraw/recolor.
import {createRequire} from 'node:module';
const sharp=createRequire(import.meta.url)('sharp');
import {mkdir,stat,writeFile} from 'node:fs/promises';
// Explicit approved source files only; no machine-specific paths in the repository.
const input=process.argv.slice(2);
if(input.length!==3) throw new Error('Usage: node scripts/p5-logo-assets.mjs <betsson.png> <sportingbet.png> <betboo.png>');
const sources=['betsson','sportingbet','betboo'].map((name,index)=>[name,input[index]]);
await mkdir('public/bookmakers',{recursive:true});
const report=[];
for(const [name,source] of sources){
  const original=await sharp(source).metadata();
  // Remove only uniform outer background, keeping all brand pixels and a safe inset.
  const cropped=await (name==='betsson'?sharp(source).extract({left:24,top:176,width:400,height:96}):sharp(source).trim({threshold:12})).png().toBuffer();
  const file=`public/bookmakers/${name}.webp`;
  const result=await sharp(cropped).resize({width:264,withoutEnlargement:true}).webp({lossless:true}).toFile(file);
  report.push({name,original:{width:original.width,height:original.height,bytes:(await stat(source)).size},optimized:{width:result.width,height:result.height,bytes:result.size},maxRenderedWidth:88,dpr:3});
}
await writeFile('output/p5-logo-assets.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
