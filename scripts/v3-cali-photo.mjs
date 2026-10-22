// One reviewed archive asset; no arbitrary URL inputs or runtime remote images.
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import sharp from 'sharp';
const source='https://commons.wikimedia.org/wiki/File:Estadio_pascual_guerrero.png';
const page=await fetch(source,{signal:AbortSignal.timeout(15000)});if(!page.ok)throw Error('PHOTO_PAGE_HTTP_'+page.status);
const html=await page.text();if(!html.includes('creativecommons.org/licenses/by-sa/4.0'))throw Error('LICENSE_CHANGED');
const original=load(html)('.fullImageLink a').first().attr('href');if(!original||new URL(original).hostname!=='upload.wikimedia.org')throw Error('PHOTO_HOST');
const response=await fetch(original,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('PHOTO_HTTP_'+response.status);
const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>6000000||createHash('sha1').update(bytes).digest('hex')!=='f105efa8366ceab0616da53edd2cda8eb1c59121')throw Error('PHOTO_CHANGED');
for(const width of [640,1280,1920])await sharp(bytes).resize({width}).webp({quality:82}).toFile(`public/editorial/cali-archive-${width}.webp`);
await writeFile('public/editorial/cali-archive-license.txt','Estadio pascual guerrero.png — Dh (DAVIDHC0520), 10 October 2023. Source: '+source+'\nLicensed CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/\nThese derivatives retain CC BY-SA 4.0. Changes: resized and converted from PNG to WebP; display crops vary. No endorsement. Archive city/stadium context, not the reported news event.\nOriginal SHA-1: f105efa8366ceab0616da53edd2cda8eb1c59121\n');
console.log(JSON.stringify({source,license:'CC BY-SA 4.0',author:'Dh (DAVIDHC0520)',date:'2023-10-10',originalSha256:createHash('sha256').update(bytes).digest('hex'),variants:[640,1280,1920]}));
