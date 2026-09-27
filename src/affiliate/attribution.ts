import type {CommercialContext} from './types';

/** First-party labels only. Never append unapproved parameters to an operator URL. */
export const REVENUE_LABELS = ['livasports_match','livasports_odds','livasports_slip','livasports_same_slip_compare',
  'livasports_banner','livasports_sticky','livasports_competition','livasports_social'] as const;
export type RevenueLabel = typeof REVENUE_LABELS[number];

export function revenueSurface(placement?:string):RevenueLabel|null {
  if(placement==='slip_bookmaker_comparison'||placement==='match_slip_comparison'||placement==='slip-comparison')return 'livasports_same_slip_compare';
  if(placement==='match_odds_table'||placement==='match-odds')return 'livasports_odds';
  if(placement==='guest-slip')return 'livasports_slip';
  if(placement==='competition_inline')return 'livasports_competition';
  if(placement==='mobile_sticky')return 'livasports_sticky';
  if(placement&&/_(banner|rail|leaderboard|inline)$/.test(placement))return 'livasports_banner';
  return null;
}
export function revenueContext(context:CommercialContext) {
  return {
    revenueSurface:revenueSurface(context.placement),
    revenueJourney:context.selections?'livasports_slip':context.fixturePublicId||/\/(jogo|partido|match)\//.test(context.pagePath)?'livasports_match':context.competitionSlug||/\/(competicoes|competiciones)\//.test(context.pagePath)?'livasports_competition':null,
  };
}
/** Coarse device class only; never store the user agent or fingerprint a visitor. */
export function deviceClass(headers:Headers):'mobile'|'tablet'|'desktop'|'unknown' {
  const ua=headers.get('user-agent');if(!ua)return 'unknown';
  if(/iPad|Tablet|Android(?!.*Mobile)/i.test(ua))return 'tablet';
  if(headers.get('sec-ch-ua-mobile')==='?1'||/Mobile|iPhone/i.test(ua))return 'mobile';
  return /Mozilla|Chrome|Safari|Firefox|Edg\//i.test(ua)?'desktop':'unknown';
}
