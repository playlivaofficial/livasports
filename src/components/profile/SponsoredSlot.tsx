import type { SponsorCampaign } from '@/profiles/types';

export function SponsoredSlot({ campaign }: { campaign: SponsorCampaign | null }) {
  if (!campaign) return null;
  return <aside className={`sponsor-slot sponsor-${campaign.placement}`} aria-label={campaign.label}>
    <span>{campaign.label}</span>
    <a href={campaign.destinationUrl} target="_blank" rel="sponsored noopener noreferrer">
      {/* A campaign may render only an approved, explicitly configured creative. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={campaign.imageUrl} alt={campaign.imageAlt} loading="lazy" />
    </a>
  </aside>;
}
