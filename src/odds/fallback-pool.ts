import {CORE_GEOS,type CoreGeo} from '@/config/geo';
import {VISIBLE_BOOKMAKERS,bookmakerConfig,isRetiredBookmaker} from './registry';

/**
 * How a bookmaker participates in one jurisdiction's comparison.
 *
 * PRIMARY_VISIBLE   a commercial-capable book: its own prices, its own logo, and a CTA once a
 *                   verified campaign is active for that GEO.
 * FALLBACK_REFERENCE a verified real feed shown only to preserve market continuity when a primary
 *                   book has no price. It is never a commercial destination, so it never carries a
 *                   CTA, and it is never a substitute identity for a primary book.
 */
export type PoolRole='PRIMARY_VISIBLE'|'FALLBACK_REFERENCE';

/**
 * A reference-only source. `affiliateEligible` is typed to the literal `false`: a fallback source
 * cannot be promoted into a commercial destination by editing this configuration. Promoting one is a
 * deliberate registry and activation change, with its own legal evidence and its own campaign.
 */
export interface FallbackReferenceSource {
  bookmaker:string;
  priority:number;
  affiliateEligible:false;
  /** Why this feed is legally and operationally eligible to be shown in this jurisdiction. */
  evidence:string;
}
export interface GeoBookmakerPool {
  geo:CoreGeo;
  primaryVisibleBookmakers:readonly string[];
  fallbackReferenceBookmakers:readonly FallbackReferenceSource[];
}

/**
 * The single place a jurisdiction's reference pool is configured. Adding a verified source here is
 * the whole change: the comparison, the slip, source health and scheduler demand all read it, so no
 * component or React tree ever names a fallback identity.
 *
 * Every pool is deliberately empty today. The active OddsPapi entitlement covers betsson, bwin,
 * inkabet and 1xbet, and each of those is already a primary somewhere — none is available as an
 * additional reference source in a jurisdiction it does not already serve, and a feed verified for
 * one jurisdiction must never be shown in another. So the architecture exists and is tested, and the
 * pools stay empty until a genuinely verified third source is entitled.
 */
const FALLBACK_REFERENCE_POOLS:Readonly<Record<CoreGeo,readonly FallbackReferenceSource[]>>={
  MX:[],
  CO:[],
  PE:[],
};

/** A jurisdiction's primary line-up, derived from the registry so there is one source of truth. */
export function primaryVisibleBookmakers(geo:CoreGeo):readonly string[]{
  return VISIBLE_BOOKMAKERS.filter(book=>(book.countries as readonly string[]).includes(geo)).map(book=>book.canonicalId);
}
export function geoBookmakerPool(geo:CoreGeo):GeoBookmakerPool{
  return {geo,primaryVisibleBookmakers:primaryVisibleBookmakers(geo),
    fallbackReferenceBookmakers:[...FALLBACK_REFERENCE_POOLS[geo]].sort((a,b)=>a.priority-b.priority)};
}
export function fallbackReferenceBookmakers(geo:CoreGeo):readonly FallbackReferenceSource[]{return geoBookmakerPool(geo).fallbackReferenceBookmakers;}
export function poolRole(geo:CoreGeo,bookmaker:string):PoolRole|null{
  if(primaryVisibleBookmakers(geo).includes(bookmaker))return 'PRIMARY_VISIBLE';
  return FALLBACK_REFERENCE_POOLS[geo].some(source=>source.bookmaker===bookmaker)?'FALLBACK_REFERENCE':null;
}
export function isFallbackReference(geo:CoreGeo,bookmaker:string){return poolRole(geo,bookmaker)==='FALLBACK_REFERENCE';}
/**
 * A reference source is never affiliate-eligible, whatever a campaign row or request claims. Callers
 * use this instead of reading a flag, so there is one answer and it cannot drift.
 */
export function fallbackAffiliateAllowed(){return false;}
/**
 * Every reference identity across all jurisdictions, for scheduler demand and budget planning. Empty
 * today, so provider spend is unchanged; a configured source is scheduled and budgeted like any other.
 */
export const FALLBACK_REFERENCE_BOOKMAKER_IDS:readonly string[]=
  [...new Set(CORE_GEOS.flatMap(geo=>FALLBACK_REFERENCE_POOLS[geo].map(source=>source.bookmaker)))].sort();

export type PoolViolation=`${string}`;
/**
 * The invariants a reference pool must satisfy. Exported pure so the rules can be exercised against
 * synthetic configurations without mutating the real one.
 *
 * A source must be a known, non-retired identity; must be legally eligible in the jurisdiction it is
 * configured for, which is what stops a Peru-only feed appearing in Colombia; must not already be a
 * primary there, which would produce two rows for one book; and must not claim affiliate eligibility.
 */
export function fallbackPoolViolations(geo:CoreGeo,sources:readonly FallbackReferenceSource[]):string[]{
  const problems:string[]=[],primary=primaryVisibleBookmakers(geo);
  const seen=new Set<string>();
  for(const source of sources){
    const book=bookmakerConfig(source.bookmaker);
    if(!book)problems.push(`${geo}/${source.bookmaker}: not a known bookmaker identity`);
    else if(isRetiredBookmaker(source.bookmaker))problems.push(`${geo}/${source.bookmaker}: retired operators are never comparable`);
    else if(!(book.countries as readonly string[]).includes(geo))problems.push(`${geo}/${source.bookmaker}: not eligible in ${geo}`);
    if(primary.includes(source.bookmaker))problems.push(`${geo}/${source.bookmaker}: already a primary in ${geo}`);
    if(seen.has(source.bookmaker))problems.push(`${geo}/${source.bookmaker}: listed twice`);
    seen.add(source.bookmaker);
    if(source.affiliateEligible!==false)problems.push(`${geo}/${source.bookmaker}: a reference source is never affiliate-eligible`);
    if(!Number.isInteger(source.priority)||source.priority<1)problems.push(`${geo}/${source.bookmaker}: priority must be a positive integer`);
    if(typeof source.evidence!=='string'||!source.evidence.trim())problems.push(`${geo}/${source.bookmaker}: eligibility evidence is required`);
  }
  return problems;
}
/** Fails the build rather than shipping a pool that could leak a feed across jurisdictions. */
export function assertFallbackPools(){
  const problems=CORE_GEOS.flatMap(geo=>fallbackPoolViolations(geo,FALLBACK_REFERENCE_POOLS[geo]));
  if(problems.length)throw new Error('ODDS_FALLBACK_POOL_INVALID: '+problems.join('; '));
}
assertFallbackPools();
