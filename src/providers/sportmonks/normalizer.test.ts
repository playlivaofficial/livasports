import { describe, expect, it } from 'vitest';
import { FixtureStatus, ProviderCode, ProviderEntityType } from '@/domain/enums';
import { ProviderMappingService } from '@/domain/provider-mapping';
import { InMemoryProviderEntityMappingRepository } from '@/repositories/provider-mapping.repository';
import { mapSportmonksFixtureStatus, SportmonksNormalizer } from './normalizer';
import type {SportmonksFixturePayload} from './types';
import {hasPregameOddsLayout} from '@/components/sports/board-policy';
import {publicMatchRevalidate,shouldCheckMatchSnapshot} from '@/match-center/public-cache-policy';

// Minimal fields from the real 2026-10-04 capture; no awarded score or winner was supplied.
const awardedFixture:SportmonksFixturePayload={
  id:19890211,sport_id:1,league_id:767,season_id:27568,state_id:17,
  state:{developer_name:'AWARDED',name:'Awarded'},starting_at:'2026-10-23 00:00:00',starting_at_timestamp:1792713600,
  participants:[{id:3807,name:'César Vallejo',meta:{location:'away'}},{id:270814,name:'San Marcos',meta:{location:'home'}}],
  scores:[],
};

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
  it.each(['AWARDED','Awarded',' awarded ','17'])('maps administrative result %s to a terminal canonical status',state=>{
    expect(mapSportmonksFixtureStatus(state)).toBe(FixtureStatus.FINISHED);
  });
  it.each([awardedFixture.state,{name:'Awarded'},undefined])('keeps real awarded fixture 19890211 terminal with unknown scores, including numeric fallback: %j',async state=>{
    const mappings=new ProviderMappingService(new InMemoryProviderEntityMappingRepository());
    const fixture=await new SportmonksNormalizer(mappings).fixture({...awardedFixture,state});
    expect(fixture.status).toBe(FixtureStatus.FINISHED);
    expect([fixture.homeScore,fixture.awayScore]).toEqual([null,null]);
    expect(fixture.kickoff.toISOString()).toBe('2026-10-23T00:00:00.000Z');
    await expect(mappings.lookupProviderId(ProviderCode.SPORTMONKS,ProviderEntityType.FIXTURE,fixture.id)).resolves.toBe('19890211');
    await expect(mappings.lookupProviderId(ProviderCode.SPORTMONKS,ProviderEntityType.TEAM,fixture.homeTeamId)).resolves.toBe('270814');
    await expect(mappings.lookupProviderId(ProviderCode.SPORTMONKS,ProviderEntityType.TEAM,fixture.awayTeamId)).resolves.toBe('3807');
    const header={status:fixture.status,kickoff:fixture.kickoff.toISOString()},now=Date.parse('2026-10-22T23:59:00Z');
    expect(hasPregameOddsLayout([header],now)).toBe(false);
    expect(shouldCheckMatchSnapshot(header.status,header.kickoff,now)).toBe(false);
    expect(publicMatchRevalidate(header,now)).toBe(3600);
  });
});
