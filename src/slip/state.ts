import {canonicalSelection,createSlipId,marketKey,selectionKey,SLIP_LIMIT,SLIP_SCHEMA_VERSION,SLIP_SCOPE,validSlipId,type CanonicalSelection,type SavedSelection,type StoredSlip} from './types';
import {DEFAULT_STAKE,parseStake} from './decimal';

export const STORAGE_KEY='livasports:guest-slip';
export type StorageNotice='RECOVERED'|'UNSUPPORTED_VERSION'|'STORAGE_UNAVAILABLE'|null;
export const EMPTY_SLIP:StoredSlip={version:SLIP_SCHEMA_VERSION,slipId:'',stake:DEFAULT_STAKE,selections:[]};
function withId(slip:StoredSlip):StoredSlip {
  return slip.slipId||!slip.selections.length?slip:{...slip,slipId:createSlipId()};
}
export function restoreSlip(raw:string|null):{slip:StoredSlip;notice:StorageNotice} {
  if(raw===null)return {slip:EMPTY_SLIP,notice:null};
  try {
    if(raw.length>12000)throw new Error('oversize');
    const v=JSON.parse(raw);
    if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('shape');
    if(v.version!==0&&v.version!==1&&v.version!==SLIP_SCHEMA_VERSION)return {slip:EMPTY_SLIP,notice:'UNSUPPORTED_VERSION'};
    if(!Array.isArray(v.selections))throw new Error('selections');
    const selections:SavedSelection[]=[];
    for(const item of v.selections.slice(0,100)){
      const canonical=canonicalSelection(v.version===0&&item?.scope===undefined?{...item,scope:SLIP_SCOPE}:item);
      if(!canonical||typeof item.addedAt!=='string'||!Number.isFinite(Date.parse(item.addedAt))||item.addedAt.length>40||
        selections.some(s=>marketKey(s)===marketKey(canonical))||selections.length===SLIP_LIMIT)continue;
      selections.push({...canonical,addedAt:new Date(item.addedAt).toISOString()});
    }
    const stake=typeof v.stake==='string'?parseStake(v.stake):DEFAULT_STAKE;
    const slipId=validSlipId(v.slipId)?v.slipId:'';
    const recovered=v.version===0||selections.length!==v.selections.length||(typeof v.stake==='string'&&stake===null)||(v.version===SLIP_SCHEMA_VERSION&&v.slipId!==undefined&&!slipId);
    return {slip:withId({version:SLIP_SCHEMA_VERSION,slipId,stake:stake??DEFAULT_STAKE,selections}),notice:recovered?'RECOVERED':null};
  }catch{return {slip:EMPTY_SLIP,notice:'RECOVERED'};}
}

export type SlipAction={type:'add';selection:CanonicalSelection;addedAt:string}|{type:'replace';selection:CanonicalSelection;addedAt:string;expectedKey:string}|
  {type:'remove';key:string}|{type:'clear'}|{type:'setStake';stake:string};
export type MutationResult={slip:StoredSlip;result:'ADDED'|'REPLACED'|'REMOVED'|'CLEARED'|'UNCHANGED'|'REPLACE_REQUIRED'|'LIMIT'|'INVALID_STAKE'};
export function mutateSlip(slip:StoredSlip,action:SlipAction):MutationResult {
  const base:StoredSlip={version:SLIP_SCHEMA_VERSION,slipId:slip.slipId,stake:parseStake(slip.stake)??DEFAULT_STAKE,selections:slip.selections};
  if(action.type==='clear')return {slip:{...EMPTY_SLIP,stake:DEFAULT_STAKE},result:base.selections.length||base.slipId?'CLEARED':'UNCHANGED'};
  if(action.type==='setStake'){
    const stake=parseStake(action.stake);if(!stake)return {slip:base,result:'INVALID_STAKE'};
    if(stake===base.stake)return {slip:base,result:'UNCHANGED'};
    return {slip:withId({...base,stake}),result:'UNCHANGED'};
  }
  if(action.type==='remove'){
    const selections=base.selections.filter(s=>selectionKey(s)!==action.key);
    return {slip:{...base,selections,slipId:selections.length?base.slipId:''},result:selections.length===base.selections.length?'UNCHANGED':'REMOVED'};
  }
  const exact=base.selections.find(s=>selectionKey(s)===selectionKey(action.selection));
  if(exact){
    if(action.type==='replace')return {slip:base,result:'UNCHANGED'};
    const selections=base.selections.filter(s=>selectionKey(s)!==selectionKey(action.selection));
    return {slip:{...base,selections,slipId:selections.length?base.slipId:''},result:'REMOVED'};
  }
  const conflict=base.selections.find(s=>marketKey(s)===marketKey(action.selection));
  if(conflict&&action.type==='replace'&&action.expectedKey!==selectionKey(conflict))return {slip:base,result:'REPLACE_REQUIRED'};
  if(!conflict&&base.selections.length>=SLIP_LIMIT)return {slip:base,result:'LIMIT'};
  const saved={...action.selection,addedAt:action.addedAt};
  const selections=conflict?base.selections.map(s=>marketKey(s)===marketKey(saved)?saved:s):[...base.selections,saved];
  return {slip:withId({...base,selections}),result:conflict?'REPLACED':'ADDED'};
}

export interface SlipStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem?(key:string):void;}
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
    reload();
    const next=mutateSlip(snapshot.slip,action);
    if(next.result==='REPLACE_REQUIRED'||next.result==='LIMIT'||next.result==='INVALID_STAKE')return next;
    if(action.type!=='clear'&&JSON.stringify(next.slip)===JSON.stringify(snapshot.slip))return next;
    let notice:StorageNotice=null;
    try{const storage=getStorage();if(action.type==='clear'&&storage.removeItem)storage.removeItem(STORAGE_KEY);else storage.setItem(STORAGE_KEY,JSON.stringify(next.slip));volatile=false;}catch{volatile=true;notice='STORAGE_UNAVAILABLE';}
    snapshot={slip:next.slip,notice,ready:true};notify();return next;
  }
  return {reload,dispatch,getSnapshot:()=>snapshot,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
}
