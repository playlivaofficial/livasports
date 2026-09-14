import type {DatabaseClient} from '@/database/client';
import type {SportmonksFixturePayload} from '@/providers/sportmonks/types';
import {SportsIngestionStore,type ProviderRow,type SeasonContext} from './ingestion-store';

/** Called only by the existing backend score ticker, inside its request-accounted sync. */
export async function persistScoreDetails(db:DatabaseClient,rows:SportmonksFixturePayload[]){
  if(!rows.length)return;
  const contexts=(await db.query<{id:string;competition_id:string;name:string;league:string;provider_id:string}>(`
    SELECT s.id,s.competition_id,s.name,lm.provider_entity_id AS league,sm.provider_entity_id AS provider_id
    FROM seasons s JOIN competitions c ON c.id=s.competition_id AND c.enabled
    JOIN provider_entity_mappings sm ON sm.livasports_entity_id=s.id AND sm.entity_type='SEASON' AND sm.provider='SPORTMONKS'
    JOIN provider_entity_mappings lm ON lm.livasports_entity_id=c.id AND lm.entity_type='COMPETITION' AND lm.provider='SPORTMONKS'
    WHERE sm.provider_entity_id=ANY($1::text[])`,[[...new Set(rows.map(r=>String(r.season_id)))]] )).rows;
  const store=new SportsIngestionStore(db);
  for(const r of contexts){
    const season:SeasonContext={id:r.id,competitionId:r.competition_id,league:r.league,providerId:Number(r.provider_id),name:r.name};
    const fixtures=rows.filter(f=>f.season_id===season.providerId&&String(f.league_id)===season.league);
    if(fixtures.length)await store.fixtures(season,fixtures as unknown as ProviderRow[]);
  }
}
