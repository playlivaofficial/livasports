import type {ReactElement} from 'react';

/**
 * Traffic Engine V1.2 — the one governed brand identity for every generated creative.
 *
 * Before this module each renderer invented its own accent (the video scenes used lime, pink and red;
 * the static asset used lime) and wrote the wordmark as the bare string "LivaSports". That is brand
 * drift, and it also shipped the wrong public identity: the public lockup is the domain, not the name.
 *
 * Everything public therefore comes from here — the marks are the real owned assets (`src/app/icon.svg`
 * for LivaSports, playliva.com's `icon.svg` for PlayLiva), and the palettes are the real site tokens
 * (`--color-accent` #24d39b for LivaSports, the #59A6FF→#0E5BF0 ramp for PlayLiva). Templates may choose
 * where a lockup sits; they may never choose what it looks like.
 *
 * Both a raw-SVG form (the FFmpeg scene pipeline rasterises SVG through sharp) and a JSX form (the
 * 1080×1920 static export runs through Satori) are provided so the two pipelines cannot diverge.
 */

/** The public brand strings. Public creatives must always show the domain, never the bare name. */
export const LIVASPORTS_PUBLIC='LivaSports.com' as const;
export const PLAYLIVA_PUBLIC='PlayLiva.com' as const;

export const BRAND={
  livasports:{
    name:'LivaSports',tld:'.com',public:LIVASPORTS_PUBLIC,
    /** `--color-accent` on livasports.com. */
    accent:'#24d39b',
    accentStrong:'#16b985',
    /** The mark's own green, as drawn in src/app/icon.svg. */
    mark:'#43e3ad',
    markPlate:'#142226',
    /** Secondary, compatible accent so `.com` reads as part of the lockup without competing with it. */
    tldInk:'#8fe8c6',
    ink:'#f7fbff',
    muted:'#a8bdc8',
    deep:'#07131c',
    panel:'#102634',
    line:'#2a4959',
  },
  playliva:{
    name:'PlayLiva',tld:'.com',public:PLAYLIVA_PUBLIC,
    accentFrom:'#59A6FF',accent:'#2A7DFF',accentTo:'#0E5BF0',
    tldInk:'#9fc8ff',
    surface:'#0b1020',
    ink:'#FFFFFF',
  },
} as const;

// ---------------------------------------------------------------------------
// SVG form — used by the FFmpeg scene pipeline
// ---------------------------------------------------------------------------

/** Gradient definitions the PlayLiva mark needs; emit once per document inside <defs>. */
export const brandDefsSvg=()=>`<linearGradient id="livaPlayMark" x1="120" y1="80" x2="380" y2="440" gradientUnits="userSpaceOnUse">`+
  `<stop offset="0" stop-color="${BRAND.playliva.accentFrom}"/><stop offset="0.55" stop-color="${BRAND.playliva.accent}"/>`+
  `<stop offset="1" stop-color="${BRAND.playliva.accentTo}"/></linearGradient>`;

/** The owned LivaSports mark (src/app/icon.svg) drawn at an arbitrary size. */
export function livaSportsMarkSvg(x:number,y:number,size:number,plate=true){
  const scale=size/64;
  return `<g transform="translate(${x} ${y}) scale(${scale})">`+
    (plate?`<rect width="64" height="64" rx="14" fill="${BRAND.livasports.markPlate}"/>`:'')+
    `<g transform="translate(8 8) scale(1.5)">`+
    `<path d="M10 7v18h13v-5h-8V7z" fill="${BRAND.livasports.mark}"/>`+
    `<path d="m20 7 5 5-5 5" stroke="${BRAND.livasports.mark}" stroke-width="3" stroke-linejoin="round" fill="none"/>`+
    `</g></g>`;
}

/** The owned PlayLiva mark (playliva.com/icon.svg). Requires `brandDefsSvg()` in the document. */
export function playLivaMarkSvg(x:number,y:number,size:number){
  const scale=size/512;
  return `<g transform="translate(${x} ${y}) scale(${scale})">`+
    `<rect x="128" y="96" width="84" height="336" rx="42" fill="url(#livaPlayMark)"/>`+
    `<path fill-rule="evenodd" clip-rule="evenodd" fill="url(#livaPlayMark)" d="M238 62a128 128 0 1 0 0 256 128 128 0 0 0 0-256Zm0 66a62 62 0 1 1 0 124 62 62 0 0 1 0-124Z"/>`+
    `<path d="M206 150 L206 230 L286 190 Z" fill="${BRAND.playliva.ink}" stroke="${BRAND.playliva.ink}" stroke-width="12" stroke-linejoin="round"/>`+
    `</g>`;
}

/**
 * The LivaSports.com lockup: owned mark, wordmark, and `.com` in the secondary accent. `.com` is a
 * tspan of the same text node, so it always sits tight against the wordmark at any size.
 */
export function livaSportsLockupSvg({x,y,size=40,plate=true}:{x:number;y:number;size?:number;plate?:boolean}){
  const markSize=Math.round(size*1.16),baseline=y+Math.round(size*0.78);
  return `${livaSportsMarkSvg(x,y-Math.round(size*0.2),markSize,plate)}`+
    `<text x="${x+markSize+Math.round(size*0.42)}" y="${baseline}" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="900" letter-spacing="-0.5">`+
    `<tspan fill="${BRAND.livasports.ink}">${BRAND.livasports.name}</tspan>`+
    `<tspan fill="${BRAND.livasports.tldInk}">${BRAND.livasports.tld}</tspan></text>`;
}

/** The PlayLiva.com lockup, sized for secondary cross-promo use. Requires `brandDefsSvg()`. */
export function playLivaLockupSvg({x,y,size=34,anchor='start'}:{x:number;y:number;size?:number;anchor?:'start'|'middle'}){
  const markSize=Math.round(size*1.18),baseline=y+Math.round(size*0.76);
  const textWidth=Math.round(size*0.56*PLAYLIVA_PUBLIC.length);
  const markX=anchor==='middle'?x-Math.round((markSize+Math.round(size*0.36)+textWidth)/2):x;
  return `${playLivaMarkSvg(markX,y-Math.round(size*0.22),markSize)}`+
    `<text x="${markX+markSize+Math.round(size*0.36)}" y="${baseline}" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="900" letter-spacing="-0.5">`+
    `<tspan fill="${BRAND.playliva.ink}">${BRAND.playliva.name}</tspan>`+
    `<tspan fill="${BRAND.playliva.tldInk}">${BRAND.playliva.tld}</tspan></text>`;
}

// ---------------------------------------------------------------------------
// JSX form — used by the Satori 1080×1920 static export
// ---------------------------------------------------------------------------

function MarkJsx({size}:{size:number}):ReactElement{
  return <div style={{display:'flex',width:size,height:size,borderRadius:size*0.22,background:BRAND.livasports.markPlate,alignItems:'center',justifyContent:'center'}}>
    <svg width={size*0.72} height={size*0.72} viewBox="0 0 48 48">
      <path d="M15 10.5v27h19.5v-7.5h-12V10.5z" fill={BRAND.livasports.mark}/>
      <path d="m30 10.5 7.5 7.5-7.5 7.5" stroke={BRAND.livasports.mark} strokeWidth="4.5" strokeLinejoin="round" fill="none"/>
    </svg>
  </div>;
}

/** LivaSports.com lockup for Satori. Satori has no tspan, so the domain is two flex spans. */
export function LivaSportsLockup({size=40}:{size?:number}):ReactElement{
  return <div style={{display:'flex',alignItems:'center',gap:Math.round(size*0.42)}}>
    <MarkJsx size={Math.round(size*1.16)}/>
    <div style={{display:'flex',fontSize:size,fontWeight:900,letterSpacing:-1}}>
      <span style={{color:BRAND.livasports.ink}}>{BRAND.livasports.name}</span>
      <span style={{color:BRAND.livasports.tldInk}}>{BRAND.livasports.tld}</span>
    </div>
  </div>;
}

/** PlayLiva.com lockup for Satori; secondary by construction — smaller, never the page's loudest element. */
export function PlayLivaLockup({size=30}:{size?:number}):ReactElement{
  const mark=Math.round(size*1.18);
  return <div style={{display:'flex',alignItems:'center',gap:Math.round(size*0.36)}}>
    <div style={{display:'flex',width:mark,height:mark,alignItems:'center',justifyContent:'center'}}>
      <svg width={mark} height={mark} viewBox="0 0 512 512">
        <defs><linearGradient id="plMarkJsx" x1="120" y1="80" x2="380" y2="440" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={BRAND.playliva.accentFrom}/><stop offset="0.55" stopColor={BRAND.playliva.accent}/><stop offset="1" stopColor={BRAND.playliva.accentTo}/>
        </linearGradient></defs>
        <rect x="128" y="96" width="84" height="336" rx="42" fill="url(#plMarkJsx)"/>
        <path fillRule="evenodd" clipRule="evenodd" fill="url(#plMarkJsx)" d="M238 62a128 128 0 1 0 0 256 128 128 0 0 0 0-256Zm0 66a62 62 0 1 1 0 124 62 62 0 0 1 0-124Z"/>
        <path d="M206 150 L206 230 L286 190 Z" fill={BRAND.playliva.ink} stroke={BRAND.playliva.ink} strokeWidth="12" strokeLinejoin="round"/>
      </svg>
    </div>
    <div style={{display:'flex',fontSize:size,fontWeight:900,letterSpacing:-0.5}}>
      <span style={{color:BRAND.playliva.ink}}>{BRAND.playliva.name}</span>
      <span style={{color:BRAND.playliva.tldInk}}>{BRAND.playliva.tld}</span>
    </div>
  </div>;
}
