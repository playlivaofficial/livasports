import type {SiteLocale} from '@/config/i18n';
import type {SlipComparisonRead} from '@/odds/read-repository';
import {buildSlipComparison} from './comparison';
import {resolveSelection} from './resolution';
import {parseResolutionRequest,selectionKey,type CanonicalSelection} from './types';
import type {FullSlipResolution} from './comparison-types';
import type {CommercialGeo} from '@/odds/commercial-geo';

export function comparisonCacheKey(selections:CanonicalSelection[],geo:CommercialGeo|null):string {
  return `slip-comparison:v2:${geo??'none'}:${selections.map(selectionKey).sort().join('|')}`;
}
export class ComparisonLoader {
  private readonly entries=new Map<string,{until:number;read:SlipComparisonRead}>();
  private readonly pending=new Map<string,Promise<SlipComparisonRead>>();
  constructor(private readonly readMany:(ids:readonly string[],geo:CommercialGeo|null)=>Promise<SlipComparisonRead>,private readonly now=Date.now,
    private readonly metric:(event:{cache:'HIT'|'MISS'|'DEDUP';count:number;locale:SiteLocale;durationMs:number;providerRequests:0})=>void=()=>{}){}
  async resolve(selections:CanonicalSelection[],locale:SiteLocale,geo:CommercialGeo|null=null):Promise<FullSlipResolution>{
    if(!parseResolutionRequest({selections,locale}))throw new Error('INVALID_SLIP');
    if(!selections.length)return this.result(selections,locale,{fixtures:new Map(),bookmakers:[],destinations:{}});
    const started=performance.now(),key=comparisonCacheKey(selections,geo),entry=this.entries.get(key);
    let read:SlipComparisonRead,cache:'HIT'|'MISS'|'DEDUP';
    if(entry&&entry.until>this.now()){read=entry.read;cache='HIT';}else{
      let pending=this.pending.get(key);cache=pending?'DEDUP':'MISS';
      if(!pending){
        if(this.pending.size>=32)throw new Error('COMPARISON_BUSY');
        pending=this.readMany([...new Set(selections.map(s=>s.fixturePublicId))].sort(),geo);this.pending.set(key,pending);
      }
      try{read=await pending;
        const now=this.now();const comparison=buildSlipComparison(selections,locale,read.fixtures,read.bookmakers,now);
        const cutoff=comparison.expiresAt?Date.parse(comparison.expiresAt):now+15000;
        this.entries.delete(key);this.entries.set(key,{until:Math.min(now+15000,cutoff),read});
        while(this.entries.size>128)this.entries.delete(this.entries.keys().next().value!);
      }finally{this.pending.delete(key);}
    }
    this.metric({cache,count:selections.length,locale,durationMs:Math.round((performance.now()-started)*10)/10,providerRequests:0});
    return this.result(selections,locale,read);
  }
  private result(selections:CanonicalSelection[],locale:SiteLocale,read:SlipComparisonRead):FullSlipResolution {
    const now=this.now();
    return {locale,resolvedAt:new Date(now).toISOString(),providerRequests:0,
      selections:selections.map(s=>resolveSelection(s,read.fixtures.get(s.fixturePublicId)??null,now)),
      comparison:buildSlipComparison(selections,locale,read.fixtures,read.bookmakers,now)};
  }
}
