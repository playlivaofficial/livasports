export const BOOKMAKER_MARKETS=['MATCH_WINNER','TOTAL_GOALS','BTTS'] as const;
/** Safe defaults only: existing approved DB campaigns, GEO and signed offers authorize outbound links. */
export const GATED_AFFILIATE={affiliateEnabled:false,affiliateCampaignId:null,affiliateDestination:null} as const;
/** Public identities. Commercial fields are overlaid with verified server-side campaign configuration. */
const IDENTITIES = [
  {canonicalId:'betsson',providerSlug:'betsson',displayName:'Betsson',shortLabel:'Betsson',countries:['BR','MX'],displayRole:'VISIBLE_PRIMARY',displayOrder:1,insurancePriority:1,logoAsset:'/bookmakers/betsson.webp'},
  {canonicalId:'sportingbet.bet.br',providerSlug:'sportingbet.bet.br',displayName:'Sportingbet BR',shortLabel:'Sportingbet',countries:['BR'],displayRole:'VISIBLE_PRIMARY',displayOrder:2,insurancePriority:2,logoAsset:'/bookmakers/sportingbet.webp'},
  // Slated for replacement by 1xBet. Betboo holds the third public slot until that swap lands in one
  // commit: Brazil's alternate-insurance path needs three visible books, so retiring it on its own
  // would ship a two-book product. When 1xBet takes the slot this becomes displayRole:'RETIRED',
  // which keeps the identity for historical odds rows, analytics and audit exports while removing it
  // from display, comparison, affiliate links and — via ACTIVE_BOOKMAKER_IDS — provider demand.
  {canonicalId:'betboo.bet.br',providerSlug:'betboo.bet.br',displayName:'betboo BR',shortLabel:'betboo',countries:['BR'],displayRole:'VISIBLE_PRIMARY',displayOrder:3,insurancePriority:3,logoAsset:'/bookmakers/betboo.webp'},
  {canonicalId:'betano.bet.br',providerSlug:'betano.bet.br',displayName:'Betano BR',shortLabel:'Betano',countries:['BR'],displayRole:'HIDDEN_INSURANCE',displayOrder:4,insurancePriority:0,logoAsset:null},
] as const;
/** A public card, the hidden insurance source, or an operator kept only so history still resolves. */
export type BookmakerDisplayRole='VISIBLE_PRIMARY'|'HIDDEN_INSURANCE'|'RETIRED';
export const BOOKMAKER_REGISTRY=IDENTITIES.map(book=>({...book,...GATED_AFFILIATE,marketSupport:BOOKMAKER_MARKETS,
  // Widened past the literals above so role checks stay meaningful while no operator is retired yet.
  displayRole:book.displayRole as BookmakerDisplayRole,
  providerFlagPolicy:book.canonicalId==='betsson'||book.canonicalId==='betano.bet.br'?'VERIFIED_LISTED_MARKET':'STRICT' as 'VERIFIED_LISTED_MARKET'|'STRICT'}));
export type BookmakerId=typeof BOOKMAKER_REGISTRY[number]['canonicalId'];
export type BookmakerDisplayName=typeof BOOKMAKER_REGISTRY[number]['displayName'];
export const VISIBLE_BOOKMAKERS=BOOKMAKER_REGISTRY.filter(book=>book.displayRole==='VISIBLE_PRIMARY').sort((a,b)=>a.displayOrder-b.displayOrder);
/**
 * Every identity the system has ever priced, retired ones included. Analytics validation and slug
 * normalization read this so historical rows and old events keep resolving after an operator leaves.
 */
export const SOURCE_BOOKMAKER_IDS:readonly BookmakerId[]=BOOKMAKER_REGISTRY.map(book=>book.canonicalId);
/**
 * The identities we still ask the provider for: the public books plus the hidden insurance source.
 * Scheduler demand and the live read queries use this, so retiring an operator stops its provider
 * spend immediately without erasing it from history.
 */
export const ACTIVE_BOOKMAKER_IDS:readonly BookmakerId[]=BOOKMAKER_REGISTRY.filter(book=>book.displayRole!=='RETIRED').map(book=>book.canonicalId);
export function bookmakerConfig(id:string){return BOOKMAKER_REGISTRY.find(book=>book.canonicalId===id);}
export function isVisibleBookmaker(id:string){return bookmakerConfig(id)?.displayRole==='VISIBLE_PRIMARY';}
/** A retired operator: still known for history, never public, never priced, never linked. */
export function isRetiredBookmaker(id:string){return bookmakerConfig(id)?.displayRole==='RETIRED';}
