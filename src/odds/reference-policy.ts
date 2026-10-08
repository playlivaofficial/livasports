import {isCoreGeo,type CoreGeo} from '@/config/geo';

/** Owner statement received 2026-10-08. No independent agreement review is claimed. */
export const REFERENCE_DISPLAY_POLICY = {
  enabled:true,
  status:'OWNER_CONFIRMED' as 'OWNER_CONFIRMED'|'UNVERIFIED',
  confirmedAt:'2026-10-08',
  evidence:'LivaSports owner confirms permission to publicly display attributed OddsPapi cross-GEO reference odds in MX, CO and PE; informational only.',
  targetGeos:['MX','CO','PE'] as readonly CoreGeo[],
  sources:[
    {geo:'CO',bookmaker:'betsson',providerBookmakerId:'betsson'},
    {geo:'CO',bookmaker:'bwin',providerBookmakerId:'bwin'},
    {geo:'PE',bookmaker:'inkabet',providerBookmakerId:'inkabet'},
    {geo:'PE',bookmaker:'1xbet',providerBookmakerId:'1xbet'},
  ] as const,
};
export function referenceDisplayAllowed(geo:unknown,policy=REFERENCE_DISPLAY_POLICY){
  return policy.enabled&&policy.status==='OWNER_CONFIRMED'&&!!policy.evidence.trim()&&isCoreGeo(geo)&&policy.targetGeos.includes(geo);
}
export function referenceSourceAllowed(target:unknown,source:unknown,bookmaker:string,providerId:string){
  return referenceDisplayAllowed(target)&&target!==source&&REFERENCE_DISPLAY_POLICY.sources.some(s=>s.geo===source&&s.bookmaker===bookmaker&&s.providerBookmakerId===providerId);
}
/** Fixed reviewed identifiers only; never input from a request/cookie. */
export function referenceSourceSql(){
  return REFERENCE_DISPLAY_POLICY.sources.map(s=>`(geo='${s.geo}' AND provider_bookmaker_id='${s.providerBookmakerId}')`).join(' OR ');
}
export function referenceTargetSql(){
  const targets=REFERENCE_DISPLAY_POLICY.targetGeos.filter(geo=>referenceDisplayAllowed(geo));
  return targets.length?`$2 IN (${targets.map(geo=>`'${geo}'`).join(',')})`:'false';
}
