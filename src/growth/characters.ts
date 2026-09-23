import type {TeamPalette} from './palette';

/**
 * Traffic Engine V1.2 — the original Liva character system (architecture only).
 *
 * The selection, tinting, pose and rotation machinery lives here and is ready to use. The artwork does
 * not: a first attempt drew the figures as SVG geometry in code and the result was judged below
 * publishable quality, so it was deliberately not committed. The Product Owner has approved an external
 * original-character art direction and will supply the final assets separately.
 *
 * When those assets arrive this becomes an asset swap, not a redesign: implement `renderCharacter` to
 * draw the supplied artwork (an `<image>` of a transparent PNG, or an inlined SVG symbol) using the
 * pose and palette this module already resolves. Nothing else in the pipeline needs to change.
 *
 * Until then `characterAssetsAvailable()` returns false, `pickScenery` never selects CHARACTER_WORLD,
 * and every fixture falls back to the crest, stadium, tunnel and editorial treatments.
 */

export const CHARACTER_POSES=['FOOT_ON_BALL','HOLDING_BALL','KICK_PREP','CELEBRATE','READY'] as const;
export type CharacterPose=typeof CHARACTER_POSES[number];

const seedOf=(value:string)=>[...value].reduce((total,char)=>(total*33+char.charCodeAt(0))>>>0,17);

export interface CharacterOptions {
  pose:CharacterPose;
  /** Club colour inspiration for shirt, shorts, socks and trim. Never a crest or real kit artwork. */
  palette:TeamPalette;
  /** Seeds per-figure variation so the same club always yields the same character. */
  seed:string;
  x:number;y:number;height:number;
  /** 'right' faces the centre from a left-hand slot; 'left' mirrors it. */
  facing?:'left'|'right';
  /** Unique per figure in a document — gradients and clips must not collide. */
  id:string;
}

/**
 * Whether approved original character artwork is wired in. Guards every character-mode decision, so
 * the creative system can ship with the mode present but dormant.
 */
export function characterAssetsAvailable():boolean{return false;}

/**
 * Draw one character. Returns null until approved artwork exists, which callers treat as "use the
 * crest/stadium fallback" rather than as an error.
 *
 * To wire the supplied assets: resolve the artwork for `options.pose`, tint its kit layers from
 * `options.palette` (primary → shirt, secondary → shorts, trim → socks and cuffs), scale it to
 * `options.height`, mirror it when `facing === 'left'`, and return the `<g>`.
 */
export function renderCharacter(options:CharacterOptions):string|null{
  void options;
  return null;
}

/** Shading gradient the artwork may reference; ids must be unique per document. */
export const characterDefs=(id:string)=>
  `<linearGradient id="${id}-shade" x1="0" y1="0" x2="1" y2="1">`+
  `<stop offset="0" stop-color="#ffffff" stop-opacity=".16"/>`+
  `<stop offset="0.55" stop-color="#000000" stop-opacity="0"/>`+
  `<stop offset="1" stop-color="#000000" stop-opacity=".26"/></linearGradient>`;

/**
 * Deterministic pose pairing for a two-character clash. Kept live so the rotation behaviour is already
 * settled and test-covered by the time the artwork lands.
 */
export function clashPoses(seed:string):[CharacterPose,CharacterPose]{
  const pairs:Array<[CharacterPose,CharacterPose]>=[
    ['FOOT_ON_BALL','READY'],['HOLDING_BALL','FOOT_ON_BALL'],['READY','KICK_PREP'],
    ['KICK_PREP','READY'],['FOOT_ON_BALL','HOLDING_BALL'],['CELEBRATE','READY'],
  ];
  return pairs[seedOf(seed)%pairs.length]!;
}
