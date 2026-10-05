export const BOOKMAKER_MARKETS=['MATCH_WINNER','TOTAL_GOALS','BTTS'] as const;
/** Safe defaults only: existing approved DB campaigns, GEO and signed offers authorize outbound links. */
export const GATED_AFFILIATE={affiliateEnabled:false,affiliateCampaignId:null,affiliateDestination:null} as const;
/** Public identities. Commercial fields are overlaid with verified server-side campaign configuration. */
const IDENTITIES = [
  // Entitled for MX/CO/PE pregame since 2026-10-02. OddsPapi publishes ONE generic Betsson feed
  // ('betsson', cloneOf null) and no .mx or .co clone, so Mexico and Colombia price off the same
  // feed. BR stays listed so historical Brazilian quotes keep resolving; BR promotion is retired.
  {canonicalId:'betsson',providerSlug:'betsson',displayName:'Betsson',shortLabel:'Betsson',countries:['BR','MX','CO'],displayRole:'VISIBLE_PRIMARY',displayOrder:1,insurancePriority:1,logoAsset:'/bookmakers/betsson.webp'},
  // Colombia's second public book: an independent Entain feed ('bwin', cloneOf null, sports.bwin.com)
  // whose prices genuinely differ from Betsson's, so CO is a real comparison. Odds and slip
  // comparison are live while every CTA stays dark — no Entain affiliate access exists yet.
  {canonicalId:'bwin',providerSlug:'bwin',displayName:'bwin',shortLabel:'bwin',countries:['CO'],displayRole:'VISIBLE_PRIMARY',displayOrder:2,insurancePriority:2,logoAsset:null},
  // Peru's only public book. OddsPapi declares it cloneOf 'betsson' and it was observed mirroring
  // Betsson's 1/X/2 prices exactly on every Liga 1 fixture, so showing the two side by side would
  // be a fake comparison. PE being Inkabet-only keeps them apart; a test asserts they never overlap.
  {canonicalId:'inkabet',providerSlug:'inkabet',displayName:'Inkabet',shortLabel:'Inkabet',countries:['PE'],displayRole:'VISIBLE_PRIMARY',displayOrder:3,insurancePriority:3,logoAsset:null},
  // Dropped from the OddsPapi subscription on 2026-10-02 by the MX/CO/PE cutover, so they can no
  // longer be priced at all — exactly the position betboo was already in. The identities stay so
  // historical odds rows, analytics events and audit exports still normalize, but a RETIRED book is
  // never displayed, never comparable, never affiliate-linked and — via ACTIVE_BOOKMAKER_IDS —
  // never requested from the provider again. Keeping them in the entitlement gate is what stopped
  // the refresh pipeline on 2026-10-02: verifiedAccountPeriod demands every active ID be entitled.
  // Retiring Betano also removes Brazil's hidden insurance source. It is unpurchasable, so there is
  // nothing to fall back to and resolveInsurance correctly reports no preferred source at all.
  {canonicalId:'sportingbet.bet.br',providerSlug:'sportingbet.bet.br',displayName:'Sportingbet BR',shortLabel:'Sportingbet',countries:['BR'],displayRole:'RETIRED',displayOrder:97,insurancePriority:97,logoAsset:'/bookmakers/sportingbet.webp'},
  {canonicalId:'1xbet',providerSlug:'1xbet',displayName:'1xBet',shortLabel:'1xBet',countries:['BR'],displayRole:'RETIRED',displayOrder:98,insurancePriority:98,logoAsset:'/bookmakers/1xbet.webp'},
  {canonicalId:'betboo.bet.br',providerSlug:'betboo.bet.br',displayName:'betboo BR',shortLabel:'betboo',countries:['BR'],displayRole:'RETIRED',displayOrder:99,insurancePriority:99,logoAsset:'/bookmakers/betboo.webp'},
  {canonicalId:'betano.bet.br',providerSlug:'betano.bet.br',displayName:'Betano BR',shortLabel:'Betano',countries:['BR'],displayRole:'RETIRED',displayOrder:100,insurancePriority:100,logoAsset:null},
] as const;
/** A public card, the hidden insurance source, or an operator kept only so history still resolves. */
export type BookmakerDisplayRole='VISIBLE_PRIMARY'|'HIDDEN_INSURANCE'|'RETIRED';
export const BOOKMAKER_REGISTRY=IDENTITIES.map(book=>({...book,...GATED_AFFILIATE,marketSupport:BOOKMAKER_MARKETS,
  // Widened past the literals above so role checks stay meaningful while no operator is retired yet.
  displayRole:book.displayRole as BookmakerDisplayRole,
  providerFlagPolicy:book.canonicalId==='betsson'||book.canonicalId==='betano.bet.br'?'VERIFIED_LISTED_MARKET':'STRICT' as 'VERIFIED_LISTED_MARKET'|'STRICT'}));
/** Canonical DB operator ID; provider mappings are independently verified per GEO. */
export type BookmakerId=string;
export type BookmakerDisplayName=string;
export const VISIBLE_BOOKMAKERS=BOOKMAKER_REGISTRY.filter(book=>book.displayRole==='VISIBLE_PRIMARY').sort((a,b)=>a.displayOrder-b.displayOrder);
/** Approved inventory of candidate identities, NOT provider mappings or permission to display odds. */
export const CANDIDATE_OPERATOR_IDS=['codere','caliente','10bet','betano','betplay','betsafe','bet365'] as const;
const CANDIDATE_IDENTITIES=[
  {canonicalId:'codere',displayName:'Codere',countries:['MX','CO']},
  {canonicalId:'caliente',displayName:'Caliente',countries:['MX']},
  {canonicalId:'10bet',displayName:'10Bet',countries:['MX']},
  {canonicalId:'betano',displayName:'Betano',countries:['CO','PE']},
  {canonicalId:'betplay',displayName:'BetPlay',countries:['CO']},
  {canonicalId:'betsafe',displayName:'Betsafe',countries:['PE']},
  {canonicalId:'bet365',displayName:'bet365',countries:['PE']},
].map(b=>({...b,shortLabel:b.displayName,providerSlug:null,displayRole:'VISIBLE_PRIMARY' as BookmakerDisplayRole,displayOrder:100,insurancePriority:100,logoAsset:null,marketSupport:BOOKMAKER_MARKETS,providerFlagPolicy:'STRICT' as const,...GATED_AFFILIATE}));
/**
 * Every identity the system has ever priced, retired ones included. Analytics validation and slug
 * normalization read this so historical rows and old events keep resolving after an operator leaves.
 */
export const SOURCE_BOOKMAKER_IDS:readonly BookmakerId[]=[...BOOKMAKER_REGISTRY.map(book=>book.canonicalId),...CANDIDATE_OPERATOR_IDS];
/**
 * The identities we still ask the provider for: the public books plus the hidden insurance source.
 * Scheduler demand and the live read queries use this, so retiring an operator stops its provider
 * spend immediately without erasing it from history.
 */
export const ACTIVE_BOOKMAKER_IDS:readonly BookmakerId[]=BOOKMAKER_REGISTRY.filter(book=>book.displayRole!=='RETIRED').map(book=>book.canonicalId);
export function bookmakerConfig(id:string){return BOOKMAKER_REGISTRY.find(book=>book.canonicalId===id)??CANDIDATE_IDENTITIES.find(book=>book.canonicalId===id);}
export function isVisibleBookmaker(id:string){const known=bookmakerConfig(id);return known?known.displayRole==='VISIBLE_PRIMARY':CANDIDATE_OPERATOR_IDS.includes(id as typeof CANDIDATE_OPERATOR_IDS[number]);}
/** A retired operator: still known for history, never public, never priced, never linked. */
export function isRetiredBookmaker(id:string){return bookmakerConfig(id)?.displayRole==='RETIRED';}
