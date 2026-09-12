import { describe, expect, it } from 'vitest';
import { eligibleSponsor, type SponsorEligibilityInput } from './sponsor';

const base: SponsorEligibilityInput={id:'approved',placement:'team_top_leaderboard',label:'Publicidade',imageUrl:'https://cdn.example/banner.png',
  imageAlt:'Parceiro aprovado',destinationUrl:'https://partner.example',locale:'br',entityType:'TEAM',enabled:true,
  startsAt:'2026-09-01T00:00:00Z',endsAt:'2026-10-01T00:00:00Z'};

describe('profile sponsor eligibility', () => {
  const now=new Date('2026-09-12T12:00:00Z');
  it('returns no slot when no approved campaign is eligible', () => {
    expect(eligibleSponsor([], 'team_top_leaderboard','br','TEAM',now)).toBeNull();
    expect(eligibleSponsor([{...base,enabled:false}], 'team_top_leaderboard','br','TEAM',now)).toBeNull();
  });
  it('enforces GEO, entity, placement, and time boundaries', () => {
    expect(eligibleSponsor([base], 'team_top_leaderboard','br','TEAM',now)?.id).toBe('approved');
    expect(eligibleSponsor([base], 'team_top_leaderboard','mx','TEAM',now)).toBeNull();
    expect(eligibleSponsor([base], 'team_top_leaderboard','br','PLAYER',now)).toBeNull();
    expect(eligibleSponsor([{...base,startsAt:'2026-10-02T00:00:00Z'}], 'team_top_leaderboard','br','TEAM',now)).toBeNull();
  });
});
