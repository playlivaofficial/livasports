// P2: renders the static social preview (1200×630) and favicon from the existing header brand mark.
// Deterministic, run once; the outputs are committed under src/app so Next serves them as metadata files.
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sharp=require(require.resolve('sharp',{paths:[require.resolve('next/package.json').replace(/package\.json$/,'')]}));
const mark=(x,y,size,fill)=>`<g transform="translate(${x} ${y}) scale(${size/32})"><path d="M10 7v18h13v-5h-8V7z" fill="${fill}"/><path d="m20 7 5 5-5 5" stroke="${fill}" stroke-width="3" stroke-linejoin="round" fill="none"/></g>`;
const og=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#142226"/>
  <rect x="0" y="0" width="1200" height="8" fill="#43e3ad"/>
  <rect x="96" y="176" width="140" height="140" rx="28" fill="#0d1a1c"/>
  ${mark(103,183,126,'#43e3ad')}
  <text x="272" y="272" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="112" font-weight="800" fill="#e8eee6">Liva<tspan fill="#43e3ad">Sports</tspan></text>
  <text x="96" y="420" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="40" fill="#b5c6c0">Futebol · Fútbol · Football</text>
  <text x="96" y="480" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="30" fill="#8aa39b">Placares, agenda, classificação e comparação de odds</text>
</svg>`;
const icon=`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#142226"/>${mark(8,8,48,'#43e3ad')}</svg>`;
await writeFile(new URL('../src/app/opengraph-image.png',import.meta.url),await sharp(Buffer.from(og)).png({compressionLevel:9}).toBuffer());
await writeFile(new URL('../src/app/icon.svg',import.meta.url),icon);
await writeFile(new URL('../src/app/opengraph-image.alt.txt',import.meta.url),'LivaSports — football scores, fixtures, standings and odds comparison\n');
console.log('brand assets written');
