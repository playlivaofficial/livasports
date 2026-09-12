import type { SiteLocale } from '@/config/i18n';
import type { ProfileEntityType, SponsorCampaign } from './types';

export const profilePlacements = [
  'team_top_leaderboard', 'team_right_rail', 'team_inline', 'player_top_leaderboard',
  'player_right_rail', 'player_inline', 'profile_mobile_inline',
] as const;
export type ProfilePlacement = typeof profilePlacements[number];

export interface SponsorEligibilityInput extends SponsorCampaign {
  locale: SiteLocale;
  entityType: ProfileEntityType;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
}
export function eligibleSponsor(campaigns: readonly SponsorEligibilityInput[], placement: ProfilePlacement,
  locale: SiteLocale, entityType: ProfileEntityType, now = new Date()): SponsorCampaign | null {
  const selected = campaigns.find(campaign => campaign.enabled && campaign.placement === placement && campaign.locale === locale
    && campaign.entityType === entityType && (!campaign.startsAt || new Date(campaign.startsAt) <= now)
    && (!campaign.endsAt || new Date(campaign.endsAt) > now));
  return selected ? { id: selected.id, placement: selected.placement, label: selected.label, imageUrl: selected.imageUrl,
    imageAlt: selected.imageAlt, destinationUrl: selected.destinationUrl } : null;
}

export interface SponsorEventContract {
  eventId: string;
  eventName: 'sponsor_impression' | 'sponsor_outbound_click';
  placement: ProfilePlacement;
  campaignId: string;
  locale: SiteLocale;
  entityType: ProfileEntityType;
  entityId: string;
}
