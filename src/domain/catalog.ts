import type { Bookmaker, Market } from './entities';
import { AffiliateStatus, MarketCode } from './enums';
import { domainId } from './ids';

const catalogTimestamp = new Date('2026-01-01T00:00:00.000Z');

export const V1_MARKETS: readonly Market[] = [
  { id: domainId<'Market'>('e39a2115-d3f6-44ac-96ba-aad4b2ad36ae'), code: MarketCode.MATCH_WINNER, displayName: 'Match Winner', requiresLine: false, enabled: true },
  { id: domainId<'Market'>('0b720fb0-1802-4b99-94f1-bd445186f32e'), code: MarketCode.TOTAL_GOALS, displayName: 'Total Goals', requiresLine: true, enabled: true },
  { id: domainId<'Market'>('914d3c89-c5d1-4f1f-a80c-328e3f13aadf'), code: MarketCode.BTTS, displayName: 'Both Teams To Score', requiresLine: false, enabled: true },
];

export const V1_BOOKMAKERS: readonly Bookmaker[] = [
  {
    id: domainId<'Bookmaker'>('12d40eac-847b-4058-8358-82eb2bcae2ed'), providerSlug: 'betano.bet.br', displayName: 'Betano BR',
    enabled: true, comparisonEnabled: true, affiliateStatus: AffiliateStatus.NOT_APPLIED, affiliateUrl: null, logoRef: null,
    createdAt: catalogTimestamp, updatedAt: catalogTimestamp,
  },
  {
    id: domainId<'Bookmaker'>('7387b37f-ccc2-4e0e-aa95-56a8a993e232'), providerSlug: 'betsson', displayName: 'Betsson',
    enabled: true, comparisonEnabled: true, affiliateStatus: AffiliateStatus.ACTIVE, affiliateUrl: null, logoRef: null,
    createdAt: catalogTimestamp, updatedAt: catalogTimestamp,
  },
];
