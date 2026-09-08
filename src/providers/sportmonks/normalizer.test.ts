import { describe, expect, it } from 'vitest';
import { FixtureStatus, ProviderCode, ProviderEntityType } from '@/domain/enums';
import { ProviderMappingService } from '@/domain/provider-mapping';
import { InMemoryProviderEntityMappingRepository } from '@/repositories/provider-mapping.repository';
import { mapSportmonksFixtureStatus, SportmonksNormalizer } from './normalizer';

describe('Sportmonks canonical normalization', () => {
  it('maps live, halftime, finished and interrupted states conservatively', () => {
    expect(mapSportmonksFixtureStatus('INPLAY_2ND_HALF')).toBe(FixtureStatus.LIVE);
    expect(mapSportmonksFixtureStatus('HT')).toBe(FixtureStatus.HALFTIME);
    expect(mapSportmonksFixtureStatus('FT_PEN')).toBe(FixtureStatus.FINISHED);
    expect(mapSportmonksFixtureStatus('INTERRUPTED')).toBe(FixtureStatus.ABANDONED);
    expect(mapSportmonksFixtureStatus('UNKNOWN_PROVIDER_STATE')).toBe(FixtureStatus.SCHEDULED);
  });
  it('maps provider fixture fields, status, teams, and current scores to internal entities', async () => {
    const mappings = new ProviderMappingService(new InMemoryProviderEntityMappingRepository());
    const normalizer = new SportmonksNormalizer(mappings);

    const fixture = await normalizer.fixture({
      id: 9981,
      sport_id: 1,
      league_id: 325,
      season_id: 2026,
      state_id: 5,
      starting_at: '2026-09-03T22:00:00Z',
      state: { developer_name: 'FINISHED' },
      participants: [
        { id: 10, name: 'Time da Casa', meta: { location: 'home' } },
        { id: 20, name: 'Time Visitante', meta: { location: 'away' } },
      ],
      scores: [
        { participant_id: 10, description: 'CURRENT', score: { goals: 2 } },
        { participant_id: 20, description: 'CURRENT', score: { goals: 1 } },
      ],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-09-03T23:58:00Z',
    });

    expect(fixture.id).not.toBe('9981');
    expect(fixture.homeTeamId).not.toBe('10');
    expect(fixture.awayTeamId).not.toBe('20');
    expect(fixture.status).toBe(FixtureStatus.FINISHED);
    expect([fixture.homeScore, fixture.awayScore]).toEqual([2, 1]);
    await expect(mappings.lookupProviderId(ProviderCode.SPORTMONKS, ProviderEntityType.FIXTURE, fixture.id))
      .resolves.toBe('9981');
  });
  it('uses explicit home/away metadata even when participant order is reversed', async () => {
    const normalizer = new SportmonksNormalizer(new ProviderMappingService(new InMemoryProviderEntityMappingRepository()));
    const fixture = await normalizer.fixture({ id: 2, sport_id: 1, league_id: 3, season_id: 4, state_id: 5,
      starting_at: '2026-09-08T20:00:00Z', participants: [{id:20,name:'Away',meta:{location:'away'}},{id:10,name:'Home',meta:{location:'home'}}],
      scores:[{participant_id:10,description:'CURRENT',score:{goals:0}},{participant_id:20,description:'CURRENT',score:{goals:1}}] });
    expect(fixture.homeScore).toBe(0); expect(fixture.awayScore).toBe(1);
  });
  it('rejects participants without explicit roles instead of guessing by array order', async () => {
    const normalizer = new SportmonksNormalizer(new ProviderMappingService(new InMemoryProviderEntityMappingRepository()));
    await expect(normalizer.fixture({ id: 2, sport_id: 1, league_id: 3, season_id: 4, state_id: 5,
      starting_at: '2026-09-08T20:00:00Z', participants: [{id:10,name:'First'},{id:20,name:'Second'}] }))
      .rejects.toThrow('no canonical home/away participants');
  });
});
