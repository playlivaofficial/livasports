import type {SiteLocale} from '@/config/i18n';
import type {SlipFixtureRead} from './resolution';
import {resolveLockedSelection} from './selection-lock';
import {verifySelection} from './selection-receipt';
import {parseResolutionRequest,type CanonicalSelection,type SlipResolution} from './types';
import type {CommercialGeo} from '@/odds/commercial-geo';

export class SlipLoader {
  private readonly entries=new Map<string,{until:number;value:SlipFixtureRead|null}>();
  constructor(private readonly readMany:(ids:readonly string[],geo:CommercialGeo|null)=>Promise<Map<string,SlipFixtureRead>>,private readonly now=Date.now){}
  async resolve(selections:CanonicalSelection[],locale:SiteLocale,geo:CommercialGeo|null=null):Promise<SlipResolution>{
    if(!parseResolutionRequest({selections,locale}))throw new Error('INVALID_SLIP');
    const values=new Map<string,SlipFixtureRead|null>();const missing:string[]=[];
    for(const s of selections){const cached=this.entries.get(`${geo??'none'}:${s.fixturePublicId}`);
      if(!('receipt' in s)&&cached&&cached.until>this.now())values.set(s.fixturePublicId,cached.value);else if(!missing.includes(s.fixturePublicId))missing.push(s.fixturePublicId);
    }
    if(missing.length){
      const read=await this.readMany(missing,geo);
      for(const id of missing){const value=read.get(id)??null;values.set(id,value);const key=`${geo??'none'}:${id}`;
        this.entries.delete(key);this.entries.set(key,{until:this.now()+15000,value});
        if(this.entries.size>256)this.entries.delete(this.entries.keys().next().value!);
      }
    }
    const now=this.now();return {locale,resolvedAt:new Date(now).toISOString(),providerRequests:0,selections:selections.map(s=>resolveLockedSelection(s,values.get(s.fixturePublicId)??null,verifySelection(s,geo),geo,now))};
  }
}
