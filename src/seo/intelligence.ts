/**
 * Search intelligence — pure derivation over stored Search Console rows. No IO, no thresholds hidden in a
 * query, and deliberately no composite "SEO score": every classification below is a named rule over real
 * numbers, labelled as a heuristic where it is one.
 */
export interface SearchRow {key:string;clicks:number;impressions:number;ctr:number;position:number}
export interface Totals {clicks:number;impressions:number;ctr:number;position:number}

/**
 * Aggregate a window. CTR is recomputed from summed clicks and impressions rather than averaged, and
 * position is weighted by impressions — averaging either one flat across days is a real arithmetic error
 * that flatters low-traffic days.
 */
export function aggregate(rows:readonly SearchRow[]):Totals{
  const clicks=rows.reduce((t,r)=>t+r.clicks,0);
  const impressions=rows.reduce((t,r)=>t+r.impressions,0);
  const weighted=rows.reduce((t,r)=>t+r.position*r.impressions,0);
  return {clicks,impressions,
    ctr:impressions?clicks/impressions:0,
    position:impressions?weighted/impressions:0};
}

/** Collapse per-day rows for the same key into one row per key, with the same weighting rules. */
export function collapse(rows:readonly SearchRow[]):SearchRow[]{
  const byKey=new Map<string,SearchRow[]>();
  for(const row of rows)byKey.set(row.key,[...(byKey.get(row.key)??[]),row]);
  return [...byKey].map(([key,group])=>({key,...aggregate(group)}));
}

export const SEARCH_THRESHOLDS={
  /** Below this a difference is noise at this traffic level, whatever the percentage says. */
  minImpressions:30,
  /** Positions 8–20: realistically reachable page-one work rather than a fantasy. */
  nearPageOneFrom:8,nearPageOneTo:20,
  /** A heuristic, not an industry benchmark: expected CTR by position band, used only to rank opportunity. */
  expectedCtrByPosition:[{maxPosition:3,ctr:0.18},{maxPosition:5,ctr:0.10},{maxPosition:10,ctr:0.05},
    {maxPosition:20,ctr:0.015},{maxPosition:Infinity,ctr:0.005}] as const,
  /** Relative movement that counts as growth or decline. */
  growth:0.20,decline:0.20,
} as const;

/** Heuristic expected CTR for a position. Explicitly a heuristic — Google publishes no official curve. */
export function expectedCtr(position:number,thresholds=SEARCH_THRESHOLDS):number{
  return thresholds.expectedCtrByPosition.find(band=>position<=band.maxPosition)?.ctr??0.005;
}

const change=(current:number,previous:number)=>previous===0?(current===0?0:1):(current-previous)/previous;

export interface Movement extends SearchRow {previousClicks:number;previousImpressions:number;previousPosition:number;
  clicksChange:number;impressionsChange:number;positionChange:number}

/** Join a window against its comparison window, key by key. */
export function compare(current:readonly SearchRow[],previous:readonly SearchRow[]):Movement[]{
  const before=new Map(collapse(previous).map(row=>[row.key,row]));
  return collapse(current).map(row=>{
    const was=before.get(row.key);
    return {...row,
      previousClicks:was?.clicks??0,previousImpressions:was?.impressions??0,previousPosition:was?.position??0,
      clicksChange:change(row.clicks,was?.clicks??0),
      impressionsChange:change(row.impressions,was?.impressions??0),
      // Position improves when the number falls, so a negative delta is a gain.
      positionChange:was?was.position-row.position:0};
  });
}

/** Impressions and clicks both rising, or impressions rising while position improves. */
export function growthPages(movements:readonly Movement[],thresholds=SEARCH_THRESHOLDS):Movement[]{
  return movements.filter(m=>m.impressions>=thresholds.minImpressions&&
    (m.impressionsChange>=thresholds.growth&&(m.clicksChange>0||m.positionChange>0)))
    .sort((a,b)=>b.impressionsChange-a.impressionsChange);
}

/** Material decline against the comparison window. */
export function losingVisibility(movements:readonly Movement[],thresholds=SEARCH_THRESHOLDS):Movement[]{
  return movements.filter(m=>m.previousImpressions>=thresholds.minImpressions&&
    (-m.impressionsChange>=thresholds.decline||-m.clicksChange>=thresholds.decline))
    .sort((a,b)=>a.impressionsChange-b.impressionsChange);
}

/** Meaningful impressions, ranking near page one — the work most likely to convert to clicks. */
export function nearPageOne(rows:readonly SearchRow[],thresholds=SEARCH_THRESHOLDS):SearchRow[]{
  return collapse(rows).filter(row=>row.impressions>=thresholds.minImpressions&&
    row.position>=thresholds.nearPageOneFrom&&row.position<=thresholds.nearPageOneTo)
    .sort((a,b)=>b.impressions-a.impressions);
}

export interface CtrOpportunity extends SearchRow {expected:number;gap:number}
/** Impressions arriving but CTR below what this position usually earns. Ranked by the clicks at stake. */
export function ctrOpportunities(rows:readonly SearchRow[],thresholds=SEARCH_THRESHOLDS):CtrOpportunity[]{
  return collapse(rows).filter(row=>row.impressions>=thresholds.minImpressions)
    .map(row=>{const expected=expectedCtr(row.position,thresholds);
      return {...row,expected,gap:(expected-row.ctr)*row.impressions};})
    .filter(row=>row.gap>0).sort((a,b)=>b.gap-a.gap);
}

export function topBy(rows:readonly SearchRow[],metric:'clicks'|'impressions',limit=10):SearchRow[]{
  return collapse(rows).sort((a,b)=>b[metric]-a[metric]).slice(0,limit);
}

/**
 * Locale from our own canonical URL structure rather than from Google's country dimension: `/br`, `/mx`
 * and `/en` are the three published trees, so the page path is the authoritative signal.
 */
export function localeOfPage(page:string):'pt-BR'|'es-MX'|'en'|'other'{
  let path:string;
  try{path=new URL(page).pathname;}catch{path=page;}
  if(/^\/br(\/|$)/.test(path))return 'pt-BR';
  if(/^\/mx(\/|$)/.test(path))return 'es-MX';
  if(/^\/en(\/|$)/.test(path))return 'en';
  return 'other';
}

export function byLocale(pageRows:readonly SearchRow[]):Array<{locale:string}&Totals>{
  const groups=new Map<string,SearchRow[]>();
  for(const row of collapse(pageRows)){
    const locale=localeOfPage(row.key);
    groups.set(locale,[...(groups.get(locale)??[]),row]);
  }
  return [...groups].map(([locale,rows])=>({locale,...aggregate(rows)}))
    .sort((a,b)=>b.impressions-a.impressions);
}

/** Search Console reports countries as lowercase ISO-3; Brazil is 'bra'. */
export const BRAZIL_COUNTRY='bra';
export function countryTotals(countryRows:readonly SearchRow[],country:string):Totals{
  return aggregate(collapse(countryRows).filter(row=>row.key.toLowerCase()===country.toLowerCase()));
}
