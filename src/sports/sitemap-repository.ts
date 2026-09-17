import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {resolveDefaultSeason} from './policy';
import {sitemapBatchSize,type SitemapKind,type SitemapCounts,type SportsSitemapEntry,type CompetitionSitemapSummary} from './sitemap';

// Counts and batches share eligibility, so pending draws and empty profiles never enter the index.
const eligibleFixtures=`SELECT f.* FROM fixtures f JOIN competitions c ON c.id=f.competition_id
  WHERE c.enabled AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id)`;
const eligibleTeams=`SELECT t.* FROM teams t WHERE NOT t.provider_placeholder AND (
  t.id IN (SELECT f.home_team_id FROM fixtures f JOIN competitions c ON c.id=f.competition_id WHERE c.enabled
    UNION SELECT f.away_team_id FROM fixtures f JOIN competitions c ON c.id=f.competition_id WHERE c.enabled)
  OR t.id IN (SELECT sm.team_id FROM team_squad_memberships sm JOIN seasons s ON s.id=sm.season_id JOIN competitions c ON c.id=s.competition_id WHERE c.enabled))`;
const eligiblePlayers=`SELECT p.* FROM players p WHERE p.id IN (
  SELECT sm.player_id FROM team_squad_memberships sm JOIN seasons s ON s.id=sm.season_id JOIN competitions c ON c.id=s.competition_id
  WHERE c.enabled AND c.coverage_status IN ('SUPPORTED','SUPPORTED_BUT_NO_CURRENT_FIXTURES'))
  AND p.id IN (SELECT player_id FROM player_season_statistics UNION SELECT player_entity_id FROM fixture_lineups WHERE player_entity_id IS NOT NULL
    UNION SELECT player_id FROM fixture_player_statistics)`;
const eligible:Record<SitemapKind,string>={matches:eligibleFixtures,teams:eligibleTeams,players:eligiblePlayers};

export class SportsSitemapRepository {
  constructor(private readonly db:QueryExecutor){}
  async counts():Promise<SitemapCounts>{
    const rows=(await this.db.query(`SELECT (SELECT count(*) FROM (${eligibleFixtures}) e)::int AS matches,
      (SELECT count(*) FROM (${eligibleTeams}) e)::int AS teams,(SELECT count(*) FROM (${eligiblePlayers}) e)::int AS players`)).rows[0];
    return {matches:Number(rows.matches),teams:Number(rows.teams),players:Number(rows.players)};
  }
  async entries(kind:SitemapKind,limit=sitemapBatchSize,offset=0):Promise<SportsSitemapEntry[]>{
    if(!Number.isSafeInteger(limit)||limit<1||limit>sitemapBatchSize||!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid sports sitemap window');
    // Page before aggregating. Independent aggregates avoid a fixtures × squads Cartesian join.
    const prefix=`WITH page AS MATERIALIZED (SELECT * FROM (${eligible[kind]}) e ORDER BY e.id LIMIT $1 OFFSET $2)`;
    const query=kind==='matches'?`${prefix} SELECT p.public_id,ht.name,at.name AS away,p.updated_at FROM page p
      JOIN teams ht ON ht.id=p.home_team_id JOIN teams at ON at.id=p.away_team_id ORDER BY p.id`
      :kind==='teams'?`${prefix}, changes AS (
        SELECT f.home_team_id AS id,f.updated_at AS stamp FROM fixtures f JOIN page p ON p.id=f.home_team_id
        UNION ALL SELECT f.away_team_id,f.updated_at FROM fixtures f JOIN page p ON p.id=f.away_team_id
        UNION ALL SELECT sm.team_id,sm.observed_at FROM team_squad_memberships sm JOIN page p ON p.id=sm.team_id),
        latest AS (SELECT id,max(stamp) AS stamp FROM changes GROUP BY id)
        SELECT p.public_id,p.name,GREATEST(p.updated_at,l.stamp) AS updated_at FROM page p LEFT JOIN latest l ON l.id=p.id ORDER BY p.id`
      :`${prefix}, changes AS (
        SELECT ps.player_id AS id,ps.observed_at AS stamp FROM player_season_statistics ps JOIN page p ON p.id=ps.player_id
        UNION ALL SELECT fl.player_entity_id,fl.observed_at FROM fixture_lineups fl JOIN page p ON p.id=fl.player_entity_id
        UNION ALL SELECT fps.player_id,fps.observed_at FROM fixture_player_statistics fps JOIN page p ON p.id=fps.player_id),
        latest AS (SELECT id,max(stamp) AS stamp FROM changes GROUP BY id)
        SELECT p.public_id,p.display_name AS name,GREATEST(p.updated_at,l.stamp) AS updated_at FROM page p LEFT JOIN latest l ON l.id=p.id ORDER BY p.id`;
    const result=await this.db.query(query,[limit,offset]);
    return result.rows.map(row=>({publicId:String(row.public_id),name:String(row.name),...(row.away?{away:String(row.away)}:{}),updatedAt:new Date(String(row.updated_at))}));
  }
  /**
   * P2: which competition tabs have content for the season a hub resolves by default.
   * Two bounded queries (seasons of enabled competitions, then EXISTS checks per default season);
   * the sitemap uses it to list only tab URLs that the page policy marks indexable.
   */
  async competitionSummaries():Promise<CompetitionSitemapSummary[]>{
    const seasonRows=(await this.db.query<Record<string,unknown>>(`SELECT c.slug,s.id,s.name,s.is_current,
      (SELECT count(*) FROM fixtures f WHERE f.season_id=s.id AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id))::int
        +(SELECT count(*) FROM sports_pending_fixtures p WHERE p.season_id=s.id)::int AS fixtures,
      (SELECT count(*)=6 AND bool_and(status='EMPTY' AND provider_count=0 AND persisted_count=0) FROM sports_season_coverage WHERE season_id=s.id) AS verified_empty
      FROM competitions c JOIN seasons s ON s.competition_id=c.id WHERE c.enabled
      ORDER BY c.slug,s.is_current DESC,s.starts_at DESC NULLS LAST,s.name DESC`)).rows;
    const bySlug=new Map<string,Array<{id:string;name:string;current:boolean;fixtures:number;verifiedEmpty:boolean}>>();
    for(const row of seasonRows){const list=bySlug.get(String(row.slug))??[];list.push({id:String(row.id),name:String(row.name),current:Boolean(row.is_current),fixtures:Number(row.fixtures),verifiedEmpty:row.verified_empty===true});bySlug.set(String(row.slug),list);}
    const defaults=[...bySlug].flatMap(([slug,seasons])=>{const season=resolveDefaultSeason(seasons);return season?[{slug,seasonId:season.id}]:[];});
    if(!defaults.length)return [];
    const ids=defaults.map(d=>d.seasonId);
    const tabRows=(await this.db.query<Record<string,unknown>>(`SELECT s.id,
      (SELECT count(*) FROM fixtures f WHERE f.season_id=s.id AND f.status IN ('SCHEDULED','LIVE','HALFTIME','POSTPONED') AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id))::int AS upcoming,
      (SELECT count(*) FROM fixtures f WHERE f.season_id=s.id AND f.status='FINISHED' AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id))::int AS results,
      EXISTS(SELECT 1 FROM standings_current sc WHERE sc.season_id=s.id) AS standings,
      EXISTS(SELECT 1 FROM season_topscorers st WHERE st.season_id=s.id AND st.provider_type_id=208 AND st.total>0) AS scorers,
      EXISTS(SELECT 1 FROM team_seasons ts WHERE ts.season_id=s.id) OR EXISTS(SELECT 1 FROM fixtures f WHERE f.season_id=s.id) AS teams,
      (SELECT max(f.updated_at) FROM fixtures f WHERE f.season_id=s.id) AS updated_at
      FROM seasons s WHERE s.id=ANY($1::uuid[])`,[ids])).rows;
    const tabs=new Map(tabRows.map(row=>[String(row.id),row]));
    return defaults.map(({slug,seasonId})=>{const row=tabs.get(seasonId);return {slug,seasonId,upcoming:Number(row?.upcoming??0),results:Number(row?.results??0),standings:row?.standings===true,scorers:row?.scorers===true,teams:row?.teams===true,updatedAt:row?.updated_at?new Date(String(row.updated_at)):null};});
  }
}
