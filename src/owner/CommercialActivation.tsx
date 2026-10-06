'use client';
import {useState,type FormEvent} from 'react';
import {CORE_GEOS,geoProfile,type CoreGeo} from '@/config/geo';
import type {CommercialOperator} from '@/affiliate/owner-commercial';

export function CommercialActivation({operators}:{operators:CommercialOperator[]}){
  const [geo,setGeo]=useState<CoreGeo>('MX'),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>,operator:CommercialOperator){event.preventDefault();const form=event.currentTarget,data=new FormData(form);setBusy(operator.operator);setError('');
    try{const response=await fetch('/api/owner/commercial',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'activate',geo,operator:operator.operator,version:operator.version,affiliateUrl:String(data.get('affiliateUrl')),campaignId:String(data.get('campaignId')),subId:String(data.get('subId')),approvalReference:String(data.get('approvalReference')),validFrom:new Date().toISOString(),validUntil:new Date(String(data.get('validUntil'))+'T23:59:59Z').toISOString(),confirmedApproval:data.get('confirmedApproval')==='on',offer:{title:String(data.get('offerTitle')??''),terms:String(data.get('offerTerms')??'')},
      // Optional publisher embeds from the affiliate media gallery. The server checks each one against
      // the approved inventory for this operator and country, so a wrong tag fails the activation.
      creatives:(['top','right','mobile'] as const).map(role=>({role,embedSourceUrl:String(data.get(`embed_${role}`)??'').trim()})).filter(c=>c.embedSourceUrl)}),cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error??'ACTIVATION_FAILED');window.location.reload();}catch(e){setError((e as Error).message);setBusy(null);}}
  async function suspend(operator:CommercialOperator){if(!window.confirm(`Suspend commercial links for ${operator.brand} in ${geo}? Odds remain independent.`))return;setBusy(operator.operator);setError('');try{const response=await fetch('/api/owner/commercial',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'suspend',geo,operator:operator.operator,version:operator.version}),cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error??'SUSPENSION_FAILED');window.location.reload();}catch(e){setError((e as Error).message);setBusy(null);}}
  return <main className="commercial-owner"><h1>Commercial Activation</h1><p>Each country has independent legal, feed and affiliate eligibility. Approval and activation require explicit confirmation; no candidate can emit an affiliate link.</p>
    <nav aria-label="Commercial country">{CORE_GEOS.map(g=><button type="button" key={g} aria-pressed={geo===g} onClick={()=>setGeo(g)}>{geoProfile(g).countryName}</button>)}</nav>
    <p>{geoProfile(geo).currency} · {operators.filter(o=>o.geo===geo&&o.status==='ACTIVE').length} active partners · launch target: at least 3 approved sportsbooks</p>
    {error?<p role="alert">{error.replaceAll('_',' ')}. No partial activation was saved.</p>:null}
    <div className="commercial-grid">{operators.filter(o=>o.geo===geo).map(operator=>{
      const ready=operator.legalStatus==='VERIFIED'&&operator.providerMappings.some(m=>m.verified)&&operator.sportsbookEnabled&&operator.oddsVisible&&operator.destinationDomains.length>0;
      return <section key={`${geo}:${operator.operator}`}><h2>{operator.brand}</h2><p><strong>{operator.status}</strong> · revision {operator.version}</p><dl>
        <dt>Legal evidence</dt><dd>{operator.legalStatus}{operator.legalReference?<span> · {operator.legalReference}</span>:null}</dd>
        <dt>Provider mappings</dt><dd>{operator.providerMappings.length?operator.providerMappings.map(m=>`${m.provider}: ${m.id} (${m.verified?'verified':'unverified'})`).join(', '):'Not verified; no feed assumed'}</dd>
        <dt>Feed evidence</dt><dd>{operator.quoteCount} stored active quotes · last observation {operator.lastQuoteAt??'none'} (not a freshness guarantee)</dd>
        <dt>Public odds</dt><dd>{operator.oddsVisible?'Enabled; freshness checked at display':'Not enabled'}</dd>
        <dt>Approved destination hosts</dt><dd>{operator.destinationDomains.join(', ')||'None verified'}</dd>
        <dt>Last validation</dt><dd>{operator.lastValidatedAt??'Not yet activated'}</dd>
      </dl>
      {!ready?<p>Activation locked until legal eligibility, provider mapping and destination hosts are verified. A pending application is not approval.</p>:null}
      <form onSubmit={e=>void submit(e,operator)}>
        <label>Approved affiliate URL<input name="affiliateUrl" type="url" required maxLength={4096} defaultValue={operator.affiliateUrl??''} autoComplete="off"/></label>
        <label>Campaign ID<input name="campaignId" maxLength={160} defaultValue={operator.campaignId??''} placeholder="Or a recognized campaign parameter in the URL"/></label>
        <label>Sub-ID (optional)<input name="subId" maxLength={160} defaultValue={operator.subId??''}/></label>
        <label>Approval reference<input name="approvalReference" required maxLength={500} placeholder="Partner approval reference"/></label>
        <label>Approved offer title (optional)<input name="offerTitle" maxLength={1000} defaultValue={operator.offer.title??''}/></label>
        <label>Approved terms (optional)<textarea name="offerTerms" maxLength={1000} defaultValue={operator.offer.terms??''}/></label>
        <label>Valid through (UTC)<input name="validUntil" type="date" required defaultValue={operator.validUntil?.slice(0,10)??''}/></label>
        <fieldset><legend>Banner embeds (optional, image-mode URL from the media gallery)</legend>
          <label>Desktop top<input name="embed_top" type="url" maxLength={4096} autoComplete="off"/></label>
          <label>Desktop right<input name="embed_right" type="url" maxLength={4096} autoComplete="off"/></label>
          <label>Mobile top<input name="embed_mobile" type="url" maxLength={4096} autoComplete="off"/></label>
        </fieldset>
        <label className="commercial-confirm"><input name="confirmedApproval" type="checkbox" required/>I confirm this exact operator and campaign are approved for {geoProfile(geo).countryName}.</label>
        <button disabled={!ready||busy!==null}>Approve and activate for {geo}</button>
      </form>{operator.status==='ACTIVE'?<button disabled={busy!==null} type="button" onClick={()=>void suspend(operator)}>Suspend commercial links</button>:null}</section>;
    })}</div><p>Brazil promotions are retired. Historical records remain intact.</p><a href="/owner/preview">Owner GEO preview</a> · <a href="/owner/growth">Growth</a>
  </main>;
}
