import {clubKey} from './config';

/**
 * Traffic Engine V1.2 — club colour inspiration for the original character kits.
 *
 * These are the clubs' well-known colours, used the way a magazine illustration uses them: to tint an
 * original Liva character's shirt, shorts, socks and trim. Nothing here reproduces a crest, a sponsor,
 * a manufacturer mark or the actual artwork of a kit, and no palette is ever drawn on top of a club's
 * real badge. A club we have no entry for is not guessed at — it falls back to a neutral Liva palette
 * derived deterministically from its name, so an unknown club still renders a coherent character.
 */

export interface TeamPalette {
  /** Dominant shirt colour. */
  primary:string;
  /** Shorts and the secondary block of the shirt. */
  secondary:string;
  /** Trim, cuffs and socks detail. */
  trim:string;
  /** Readable ink for a name sitting on `primary`. */
  onPrimary:string;
  /** True when this came from the editorial table rather than the neutral fallback. */
  known:boolean;
}

const ink=(hex:string)=>{
  const value=hex.replace('#','');
  const [r,g,b]=[0,2,4].map(offset=>parseInt(value.slice(offset,offset+2),16));
  // Rec. 601 luma; light shirts take dark ink and vice versa.
  return (r*299+g*587+b*114)/1000>150?'#0b1620':'#ffffff';
};

const TABLE:Readonly<Record<string,readonly [string,string,string]>>={
  flamengo:['#e23e2e','#101010','#f2c14e'],
  corinthians:['#101010','#f4f6f8','#bfc7cc'],
  palmeiras:['#0c6b3d','#f4f6f8','#9fe3bd'],
  'sao-paulo':['#f4f6f8','#d3222a','#101010'],
  'vasco-da-gama':['#101010','#f4f6f8','#c8ced2'],
  santos:['#f4f6f8','#101010','#c8ced2'],
  cruzeiro:['#1f5db8','#f4f6f8','#9dc2ef'],
  gremio:['#1b4e9b','#101010','#8fb6e8'],
  'atletico-mineiro':['#101010','#f4f6f8','#c8ced2'],
  internacional:['#ce1126','#f4f6f8','#f0a0a8'],
  botafogo:['#101010','#f4f6f8','#c8ced2'],
  fluminense:['#7a1f3d','#0b6b3a','#f4f6f8'],
  bahia:['#1c55a5','#d22630','#f4f6f8'],
  fortaleza:['#1e3a8a','#d32f2f','#f4f6f8'],
  'athletico-pr':['#d0021b','#101010','#f4f6f8'],
  vitoria:['#e01e26','#101010','#f4f6f8'],
  coritiba:['#0b6b3a','#f4f6f8','#9fe3bd'],
  bragantino:['#f4f6f8','#e11b22','#101010'],
  goias:['#0b6b3a','#f4f6f8','#9fe3bd'],
  ceara:['#101010','#f4f6f8','#c8ced2'],
  sport:['#d0021b','#101010','#f4f6f8'],
  juventude:['#0b6b3a','#f4f6f8','#9fe3bd'],
  'atletico-go':['#d0021b','#101010','#f4f6f8'],
  mirassol:['#f5c518','#0b6b3a','#101010'],
  criciuma:['#f5c518','#101010','#f4f6f8'],
  'america-mineiro':['#0b6b3a','#f4f6f8','#9fe3bd'],
  'vila-nova':['#d0021b','#f4f6f8','#101010'],
  londrina:['#1f5db8','#f4f6f8','#9dc2ef'],
  'operario-pr':['#101010','#f4f6f8','#c8ced2'],
  chapecoense:['#0b6b3a','#f4f6f8','#9fe3bd'],
  remo:['#1f5db8','#f4f6f8','#9dc2ef'],
};

/** Neutral Liva palette hues, picked so any unknown club still lands on a readable, on-brand kit. */
const FALLBACK_HUES=['#2f6f7f','#3f5f8f','#5a4f7a','#2f7f63','#7a5340','#4a4f5c'] as const;

export function teamPalette(slug:string,name=''):TeamPalette{
  const entry=TABLE[clubKey(slug)];
  if(entry)return {primary:entry[0],secondary:entry[1],trim:entry[2],onPrimary:ink(entry[0]),known:true};
  // Deterministic, so the same club always renders the same character kit across days and platforms.
  const seed=[...`${slug}|${name}`].reduce((total,char)=>(total*31+char.charCodeAt(0))>>>0,7);
  const primary=FALLBACK_HUES[seed%FALLBACK_HUES.length];
  return {primary,secondary:'#eef3f6',trim:'#9fb4c0',onPrimary:ink(primary),known:false};
}

/** Two kits that must not read as the same team; nudges the away kit when both clubs share a palette. */
export function matchPalettes(home:{slug:string;name:string},away:{slug:string;name:string}):{home:TeamPalette;away:TeamPalette}{
  const first=teamPalette(home.slug,home.name);
  let second=teamPalette(away.slug,away.name);
  if(second.primary.toLowerCase()===first.primary.toLowerCase()){
    // Swap the away kit onto its own secondary rather than inventing a colour neither club uses.
    second={...second,primary:second.secondary,secondary:second.primary,onPrimary:ink(second.secondary)};
  }
  return {home:first,away:second};
}
