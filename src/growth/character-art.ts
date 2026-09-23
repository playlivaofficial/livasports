import 'server-only';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';
import {characterAssetPath,type CharacterIdentity,type CharacterPose} from './characters';
import type {TeamPalette} from './palette';

const rgb=(hex:string)=>[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16));
/** Runtime fabric tinting; preserve the approved skin, hair, white boots and alpha. No kit logos. */
export async function loadCharacterArt(identity:CharacterIdentity,pose:CharacterPose,palette:TeamPalette):Promise<string|null>{
  try{
    const source=await readFile(join(process.cwd(),'public',characterAssetPath(identity,pose)));
    const {data,info}=await sharp(source).resize(600,900).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const primary=rgb(palette.primary),secondary=rgb(palette.secondary),trim=rgb(palette.trim);
    for(let index=0;index<data.length;index+=4){
      if(data[index+3]<230)continue;
      const r=data[index],g=data[index+1],b=data[index+2],y=Math.floor(index/4/info.width)/info.height;
      if(y<.145||y>.91)continue;
      const fabric=g>r*1.27&&b>r*1.18&&g>b*.85&&g<b*1.6;
      const edging=g>r*1.1&&r>g*.56&&b<g*.78;
      if(!fabric&&!edging)continue;
      const target=edging?trim:y>.465&&y<.63?secondary:primary;
      const light=Math.min(1.45,Math.max(.22,(r*.299+g*.587+b*.114)/(edging?185:75)));
      for(let c=0;c<3;c++)data[index+c]=Math.min(255,Math.round(target[c]*light));
    }
    const png=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  }catch{return null;}
}
