import type {QueryExecutor} from '@/database/client';
import {normalizeTeamName} from './matching';
import type {ProviderOddsFixture,CanonicalOddsFixture} from './types';

export interface TeamIdentity {providerId?:string;teamId:string;competitionId?:string;normalizedName?:string;}
/** Names may be ambiguous; keep all candidates rather than overwriting a previous identity. */
export async function readTeamIdentities(db:QueryExecutor):Promise<TeamIdentity[]>{
  const {rows}=await db.query(`SELECT provider_entity_id AS "providerId",livasports_entity_id AS "teamId"
    FROM provider_entity_mappings WHERE provider='ODDSPAPI' AND entity_type='TEAM'`);
  const aliases=await db.query(`SELECT team_id AS "teamId",competition_id AS "competitionId",normalized_name AS "normalizedName"
    FROM odds_team_aliases WHERE provider='ODDSPAPI'`);
  return [...rows,...aliases.rows] as TeamIdentity[];
}
export async function rememberTeamAliases(db:QueryExecutor,matches:readonly {raw:ProviderOddsFixture;fixture:CanonicalOddsFixture|null}[]){
  const aliases=matches.flatMap(({raw,fixture})=>fixture?[
    ...raw.homeNames.map(name=>({team:fixture.homeId,name,providerId:raw.homeProviderId})),
    ...raw.awayNames.map(name=>({team:fixture.awayId,name,providerId:raw.awayProviderId})),
  ].map(a=>({team:a.team,competition:fixture.competitionId,name:normalizeTeamName(a.name),evidence:{providerFixtureId:raw.providerId,providerTeamId:a.providerId,name:a.name,canonicalKickoff:fixture.kickoff}})):[]).filter(a=>a.name);
  await db.query(`INSERT INTO odds_team_aliases(provider,competition_id,team_id,normalized_name,evidence)
    SELECT DISTINCT ON (competition,team,name) 'ODDSPAPI',competition,team,name,evidence
    FROM jsonb_to_recordset($1::jsonb) AS a(competition uuid,team uuid,name text,evidence jsonb)
    ON CONFLICT DO NOTHING`,[JSON.stringify(aliases)]);
}
