import {canonicalSelection,selectionKey,SLIP_LIMIT,SLIP_SCOPE,type CanonicalSelection,type SavedSelection,type StoredSlip} from './types';

export const STORAGE_KEY='livasports:guest-slip';
export type StorageNotice='RECOVERED'|'UNSUPPORTED_VERSION'|'STORAGE_UNAVAILABLE'|null;
export const EMPTY_SLIP:StoredSlip={version:1,selections:[]};
export function restoreSlip(raw:string|null):{slip:StoredSlip;notice:StorageNotice} {
  if(raw===null)return {slip:EMPTY_SLIP,notice:null};
  try {
    if(raw.length>12000)throw new Error('oversize');
    const v=JSON.parse(raw);
    if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('shape');
    if(v.version!==1&&v.version!==0)return {slip:EMPTY_SLIP,notice:'UNSUPPORTED_VERSION'};
    if(!Array.isArray(v.selections))throw new Error('selections');
    const selections:SavedSelection[]=[];
    for(const item of v.selections.slice(0,100)){
      // The only legacy migration adds the explicitly missing regulation scope to v0.
      const canonical=canonicalSelection(v.version===0&&item?.scope===undefined?{...item,scope:SLIP_SCOPE}:item);
      if(!canonical||typeof item.addedAt!=='string'||!Number.isFinite(Date.parse(item.addedAt))||item.addedAt.length>40||
        selections.some(s=>s.fixturePublicId===canonical.fixturePublicId)||selections.length===SLIP_LIMIT)continue;
      selections.push({...canonical,addedAt:new Date(item.addedAt).toISOString()});
    }
    return {slip:{version:1,selections},notice:v.version===0||selections.length!==v.selections.length?'RECOVERED':null};
  }catch{return {slip:EMPTY_SLIP,notice:'RECOVERED'};}
}

export type SlipAction={type:'add';selection:CanonicalSelection;addedAt:string}|{type:'replace';selection:CanonicalSelection;addedAt:string;expectedKey:string}|
  {type:'remove';key:string}|{type:'clear'};
export type MutationResult={slip:StoredSlip;result:'ADDED'|'REPLACED'|'REMOVED'|'CLEARED'|'UNCHANGED'|'REPLACE_REQUIRED'|'LIMIT'};
export function mutateSlip(slip:StoredSlip,action:SlipAction):MutationResult {
  if(action.type==='clear')return {slip:EMPTY_SLIP,result:slip.selections.length?'CLEARED':'UNCHANGED'};
  if(action.type==='remove'){
    const selections=slip.selections.filter(s=>selectionKey(s)!==action.key);
    return {slip:{version:1,selections},result:selections.length===slip.selections.length?'UNCHANGED':'REMOVED'};
  }
  const existing=slip.selections.find(s=>s.fixturePublicId===action.selection.fixturePublicId);
  if(existing&&selectionKey(existing)===selectionKey(action.selection))return {slip,result:'UNCHANGED'};
  if(existing&&(action.type!=='replace'||action.expectedKey!==selectionKey(existing)))return {slip,result:'REPLACE_REQUIRED'};
  if(!existing&&slip.selections.length>=SLIP_LIMIT)return {slip,result:'LIMIT'};
  const saved={...action.selection,addedAt:action.addedAt};
  const selections=existing?slip.selections.map(s=>s.fixturePublicId===saved.fixturePublicId?saved:s):[...slip.selections,saved];
  return {slip:{version:1,selections},result:existing?'REPLACED':'ADDED'};
}

export interface SlipStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;}
export function createSlipStore(getStorage:()=>SlipStorage){
  let volatile=false;
  let snapshot={slip:EMPTY_SLIP,notice:null as StorageNotice,ready:false};
  const listeners=new Set<()=>void>();
  function notify(){for(const listener of listeners)listener();}
  function reload(){
    if(volatile&&snapshot.ready)return;
    try{const restored=restoreSlip(getStorage().getItem(STORAGE_KEY));
      if(JSON.stringify(snapshot.slip)!==JSON.stringify(restored.slip)||snapshot.notice!==restored.notice||!snapshot.ready){snapshot={...restored,ready:true};notify();}
    }catch{volatile=true;snapshot={...snapshot,ready:true,notice:'STORAGE_UNAVAILABLE'};notify();}
  }
  function dispatch(action:SlipAction):MutationResult {
    // Re-read the latest storage before each mutation so other tabs' completed edits are retained.
    // Storage events call reload (never echo writes). Truly simultaneous writes are last-writer-wins.
    reload();
    const next=mutateSlip(snapshot.slip,action);
    if(next.result==='REPLACE_REQUIRED'||next.result==='LIMIT'||next.result==='UNCHANGED')return next;
    let notice:StorageNotice=null;
    try{getStorage().setItem(STORAGE_KEY,JSON.stringify(next.slip));volatile=false;}catch{volatile=true;notice='STORAGE_UNAVAILABLE';}
    snapshot={slip:next.slip,notice,ready:true};notify();return next;
  }
  return {reload,dispatch,getSnapshot:()=>snapshot,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
}
