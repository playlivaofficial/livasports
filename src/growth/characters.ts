import type {TeamPalette} from './palette';

/** Original Liva characters approved by the owner on 2026-09-24, never real-player media. */
export const CHARACTER_ASSET_VERSION='approved-v1' as const;
export const CHARACTER_POSES=['FOOT_ON_BALL','HOLDING_BALL','KICK_PREP','CELEBRATE','READY'] as const;
export type CharacterPose=typeof CHARACTER_POSES[number];
export type CharacterIdentity='curly'|'fade';
export const CHARACTER_IDENTITIES=['curly','fade'] as const;
const poseFiles:Record<CharacterPose,string>={FOOT_ON_BALL:'foot-on-ball',HOLDING_BALL:'holding-ball',KICK_PREP:'kick-prep',CELEBRATE:'celebrate',READY:'ready'};
const seedOf=(value:string)=>[...value].reduce((total,char)=>(total*33+char.charCodeAt(0))>>>0,17);

export interface CharacterOptions {
  pose:CharacterPose;identity:CharacterIdentity;palette:TeamPalette;seed:string;
  x:number;y:number;height:number;facing?:'left'|'right';id:string;
}
export function characterAssetPath(identity:CharacterIdentity,pose:CharacterPose){
  return `/growth/characters/${CHARACTER_ASSET_VERSION}/${identity}-${poseFiles[pose]}.png`;
}
export function characterAssetsAvailable(){return true;}
/** Failed loads return null and retain the club-crest composition. */
export function renderCharacter(options:CharacterOptions,data:string|null):string|null{
  if(!data?.startsWith('data:image/png;base64,'))return null;
  const width=options.height*2/3;
  const transform=options.facing==='left'?`translate(${options.x+width} ${options.y}) scale(-1 1)`:`translate(${options.x} ${options.y})`;
  return `<g data-liva-character="${options.identity}" data-pose="${options.pose}" transform="${transform}"><image href="${data}" width="${width}" height="${options.height}" preserveAspectRatio="xMidYMid meet"/></g>`;
}
export function clashPoses(seed:string):[CharacterPose,CharacterPose]{
  const pairs:Array<[CharacterPose,CharacterPose]>=[
    ['FOOT_ON_BALL','READY'],['HOLDING_BALL','FOOT_ON_BALL'],['READY','KICK_PREP'],
    ['KICK_PREP','READY'],['FOOT_ON_BALL','HOLDING_BALL'],['CELEBRATE','READY'],
  ];
  const channel=seed.split(':').at(-1);
  const platformOffset=channel==='INSTAGRAM_REELS'?2:channel==='YOUTUBE_SHORTS'?4:0;
  const fixtureSeed=seed.replace(/:(TIKTOK|INSTAGRAM_REELS|YOUTUBE_SHORTS)$/,'');
  return pairs[(seedOf(fixtureSeed)+platformOffset)%pairs.length]!;
}
