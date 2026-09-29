import {contentHash} from './policy';
export function metadataSourceSignature(label:string,status:string|null,kickoff:string|null){
  return contentHash({label,status,kickoff:kickoff?new Date(kickoff).toISOString():null});
}
/** A changed kickoff, participant or lifecycle invalidates the experiment override immediately. */
export function optimizationMetadata(value:unknown,label:string,status:string,kickoff:string){
  if(!value||typeof value!=='object')return null;
  const v=value as Record<string,unknown>;
  if(v.sourceSignature!==metadataSourceSignature(label,status,kickoff)||typeof v.title!=='string'||typeof v.description!=='string')return null;
  if(!v.title||v.title.length>180||!v.description||v.description.length>320)return null;
  return {title:v.title,description:v.description};
}
