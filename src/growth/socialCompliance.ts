import {VIDEO_CHANNELS,type GrowthVideoChannel} from './config';
import type {GrowthPlatformDraft} from './types';

/** Product guardrails, not platform certification. Review official policies before changing these. */
export const SOCIAL_POLICY_VERSION='social-editorial-1';
export const socialCompliance={
  tiktokRiskMode:'strict',
  tiktok:{gamblingTermsAllowed:false,bookmakerLogosAllowed:false,directAffiliateCtaAllowed:false,oddsTableAllowed:false,bonusLanguageAllowed:false,editorialSportsContent:true},
  instagramAllowBettingContext:false,
  instagram:{gamblingTermsAllowed:false,bookmakerLogosAllowed:false,directAffiliateCtaAllowed:false,editorialSportsContent:true},
  youtube:{directGamblingDestinationAllowed:false,guaranteedReturnClaimsAllowed:false,editorialSportsContent:true},
  // Empty deliberately: a flag alone never constitutes account/GEO permission or Google certification.
  approvals:[] as Array<{platform:GrowthVideoChannel;account:string;geo:string;expiresAt:string;evidence:string;googleCertified:boolean;destinations:string[]}>,
} as const;
export const SOCIAL_LABELS:Record<GrowthVideoChannel,string>={TIKTOK:'TikTok Safe',INSTAGRAM_REELS:'Instagram Reels',YOUTUBE_SHORTS:'YouTube Shorts'};
export const EDITORIAL_COPY={
  TIKTOK:{hook:'Quem chega melhor?',cta:'Veja a análise completa no LivaSports.',steps:['VEJA O CONFRONTO','COMPARE OS DADOS','ACOMPANHE O FUTEBOL']},
  INSTAGRAM_REELS:{hook:'Quem leva a melhor?',cta:'Confira os principais dados do confronto no LivaSports.',steps:['CONHEÇA O CONTEXTO','COMPARE OS DADOS','ACOMPANHE A PARTIDA']},
  YOUTUBE_SHORTS:{hook:'Os principais dados do confronto',cta:'Mais dados e análise do confronto no LivaSports.',steps:['DADOS DO CONFRONTO','CONTEXTO DA RODADA','ANÁLISE DO JOGO']},
} as const;
export const EDITORIAL_DATA_SUBTITLE='Dados dos jogos registrados. Confira o contexto completo no LivaSports.';
export interface SocialComplianceResult {status:'ready'|'blocked_for_review';policyVersion:string;rejectionReasons:string[];}
export interface ComplianceOutput {
  renderedText?:string[];subtitleText?:string[];voiceoverScript?:string;caption?:string;hashtags?:string[];cta?:string;
  coverText?:string;metadata?:unknown;altText?:string;urls?:string[];
  visuals?:{oddsTable:boolean;bookmakerLogos:boolean;affiliateButtons:boolean;unknownAssets:boolean};
}
const normalize=(s:string)=>{
  let decoded=s;try{decoded=decodeURIComponent(s);}catch{/* malformed escaping still scanned */}
  return decoded.replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(Math.min(parseInt(n,16),0x10ffff)))
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff))).normalize('NFKD').replace(/[\u0300-\u036f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,'').toLowerCase();
};
const terms=/\b(apost\w*|bet|bets|betting|bilhetes?|odds?|cotac\w*|bookmakers?|bonus|free[\s_-]*bet|giros?|spins?|ganhe\w*|deposit\w*|deposite\w*|affiliate\w*|afiliad\w*|casino\w*|cassino\w*|apuest\w*|cuotas?|betsson|betano|betboo|sportingbet|1xbet|bwin)\b|casa\w*\s+de\s+aposta|jogue\s+agora|juega\s+ahora|#[\w]*(?:odds|bet|apost|bonus|bilhete|affiliate|afiliad)[\w]*/i;
const guarantees=/\b(garant\w*\s+(retorn\w*|ganh\w*|lucro\w*|vitor\w*|gananc\w*|win\w*|return\w*)|(retorn\w*|ganh\w*|lucro\w*|vitor\w*|gananc\w*|win\w*|return\w*)\s+garant\w*|guaranteed\s+(win\w*|return\w*|profit\w*)|sem\s+risco|risk[ -]*free)\b/i;
const promotion=/\b(cupom|cupon|promo[\s_-]*code|codigo\s+promocional|use\s+(?:o\s+)?(?:codigo|code))\b/i;
const strings=(v:unknown):string[]=>typeof v==='string'?[v]:Array.isArray(v)?v.flatMap(strings):v&&typeof v==='object'?Object.values(v).flatMap(strings):[];
function check(output:ComplianceOutput):SocialComplianceResult{
  const reasons:string[]=[];
  if(!output||typeof output!=='object')return {status:'blocked_for_review',policyVersion:SOCIAL_POLICY_VERSION,rejectionReasons:['OUTPUT_MISSING']};
  if(!strings(output).some(s=>s.trim()))reasons.push('OUTPUT_MISSING');
  for(const [field,value] of Object.entries(output))for(const text of field==='metadata'&&value!==undefined?[JSON.stringify(value),...strings(value)]:strings(value)){
    const n=normalize(text);
    if(terms.test(n))reasons.push(`RESTRICTED_LANGUAGE:${field}`);
    if(guarantees.test(n))reasons.push(`GUARANTEED_RETURN:${field}`);
    if(promotion.test(n))reasons.push(`PROMOTIONAL_CODE:${field}`);
    // No unreviewed URLs, shortened links, emails or spelled-out gambling destinations.
    for(const url of n.match(/(?:https?:\/\/|www\.)[^\s<>"']+|\b[a-z0-9-]+\.[a-z]{2,24}(?:\.[a-z]+)?[^\s<>"']*/g)??[]){
      if(url!=='livasports.com'&&!/^https:\/\/livasports\.com\/(?:br\/jogo|mx\/partido|en\/match)\/[a-z0-9-]+(?:\?utm_[a-z_]+=[a-z0-9_-]+(?:&utm_[a-z_]+=[a-z0-9_-]+)*)?$/.test(url))reasons.push(`UNAPPROVED_DESTINATION:${field}`);
    }
  }
  if(output.visuals?.oddsTable)reasons.push('ODDS_TABLE');
  if(output.visuals?.bookmakerLogos)reasons.push('BOOKMAKER_LOGO');
  if(output.visuals?.affiliateButtons)reasons.push('AFFILIATE_BUTTON');
  if(output.visuals?.unknownAssets)reasons.push('UNREVIEWED_ASSET');
  return {status:reasons.length?'blocked_for_review':'ready',policyVersion:SOCIAL_POLICY_VERSION,rejectionReasons:[...new Set(reasons)]};
}
export const tiktokComplianceCheck=(output:ComplianceOutput)=>check(output);
export const youtubeGamblingComplianceCheck=(output:ComplianceOutput)=>check(output);
// Even with an Instagram flag on, this release stays editorial until an approved integration is implemented.
export function platformComplianceCheck(channel:GrowthVideoChannel,output:ComplianceOutput){
  if(!VIDEO_CHANNELS.includes(channel))return {status:'blocked_for_review' as const,policyVersion:SOCIAL_POLICY_VERSION,rejectionReasons:['UNKNOWN_PLATFORM']};
  return channel==='TIKTOK'?tiktokComplianceCheck(output):channel==='YOUTUBE_SHORTS'?youtubeGamblingComplianceCheck(output):check(output);
}
export function draftCompliance(draft:GrowthPlatformDraft,renderedText:string[]=[]):SocialComplianceResult{
  const blocked=():SocialComplianceResult=>({status:'blocked_for_review',policyVersion:SOCIAL_POLICY_VERSION,rejectionReasons:['UNVERIFIED_EXPORT_MODEL']});
  if(!draft||!VIDEO_CHANNELS.includes(draft.channel)||!Array.isArray(draft.scenes)||!Array.isArray(draft.hashtags)||!draft.hashtags.every(s=>typeof s==='string')
    ||![draft.title,draft.description,draft.script,draft.caption,draft.cta].every(s=>typeof s==='string'&&s.trim())
    ||draft.template!=='MATCH_CLASH'||!draft.scenes.every(s=>s&&['HOOK','CONTEXT','EDITORIAL_DATA','CTA'].includes(s.visual)&&Array.isArray(s.assets)&&s.assets.every(a=>a&&typeof a.label==='string')
      &&[s.headline,s.subtitle,s.voiceover].every(t=>typeof t==='string'&&t.trim())))return blocked();
  const result=platformComplianceCheck(draft.channel,{
    renderedText:[...draft.scenes.map(s=>s.headline),...renderedText],subtitleText:draft.scenes.map(s=>s.subtitle),
    voiceoverScript:[draft.script,...draft.scenes.map(s=>s.voiceover)].join(' '),caption:draft.caption,hashtags:draft.hashtags,cta:draft.cta,
    coverText:draft.social?.coverText,metadata:{title:draft.title,description:draft.description,hook:draft.hook,extra:draft.social?.metadata},altText:draft.social?.altText,
    visuals:{oddsTable:draft.scenes.some(s=>s.visual==='ODDS'||s.template==='ODDS_COMPARISON'),bookmakerLogos:false,affiliateButtons:false,
      unknownAssets:draft.scenes.some(s=>s.assets.some(a=>a.kind!=='TEAM_CREST'||!a.commercialEligible||!!a.url&&!/^https:\/\/cdn\.sportmonks\.com\/images\/soccer\/teams\//.test(a.url)))},
  });
  if(draft.social?.policyVersion!==SOCIAL_POLICY_VERSION||draft.social?.mode!=='EDITORIAL'||!draft.social.coverText||!draft.social.altText
    ||!draft.social.sourceFixtureId||!Number.isFinite(Date.parse(draft.social.generatedAt))||draft.social.targetGeo!=='BR'||!draft.scenes.length){
    result.status='blocked_for_review';result.rejectionReasons.push('UNVERIFIED_EXPORT_MODEL');
  }
  return result;
}
/** JSONB reorders object keys, but never array order. Preserve every value in a canonical encoding. */
function stableJson(value:unknown):string{return JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
/** Excludes timings (narration adjusts them), never excludes any visible text or asset identity. */
export function socialDraftIdentity(draft:GrowthPlatformDraft){return stableJson({channel:draft.channel,title:draft.title,description:draft.description,hook:draft.hook,script:draft.script,caption:draft.caption,hashtags:draft.hashtags,cta:draft.cta,template:draft.template,creative:draft.creative,social:draft.social,scenes:draft.scenes.map(scene=>({...scene,startSeconds:undefined,durationSeconds:undefined}))});}
/** Accept existing exact-content proofs regardless of JSON object-key order; no recertification or writes. */
export function matchesSocialDraftIdentity(draft:GrowthPlatformDraft,identity:unknown):boolean{
  if(typeof identity!=='string')return false;
  try{return stableJson(JSON.parse(identity))===socialDraftIdentity(draft);}catch{return false;}
}
/** Posting copy may differ; rendered narrative/artwork may not. */
export function socialMasterIdentity(draft:GrowthPlatformDraft){return stableJson({script:draft.script,template:draft.template,creative:draft.creative,scenes:draft.scenes.map(scene=>({...scene,startSeconds:undefined,durationSeconds:undefined}))});}
