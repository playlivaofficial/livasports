import 'server-only';
import type {QueryExecutor} from '@/database/client';
import {matchSitemapFutureDays,matchSitemapPastDays,submittableCoverageStatuses} from '@/seo/policy';
import {resolveDefaultSeason} from './policy';
import {sitemapBatchSize,type SitemapKind,type SitemapCounts,type SportsSitemapEntry,type CompetitionSitemapSummary} from './sitemap';

// Counts and batches share eligibility, so pending draws and empty profiles never enter the index.
/**
 * M1: registry `enabled` says we route a competition; `coverage_status` says we actually have data for it.
 * Submission needs both, so hubs we merely know about stop spending index budget.
 */
const submittableCompetition=`c.enabled AND c.coverage_status IN (${submittableCoverageStatuses.map(status=>`'${status}'`).join(',')})`;
/** Integer-literal interval built from the policy constants; never from request data. */
const days=(value:number)=>`interval '${Math.trunc(value)} days'`;
/**
 * M1: the submitted kickoff window mirrors `matchSitemapWindow()` in the SEO policy — a completed match holds
 * result value for about a month and an upcoming match earns traffic once it is close enough to carry odds.
 * Fixtures outside the window keep their routes and internal links; they only leave submission.
 */
const matchWindow=`f.kickoff>=now()-${days(matchSitemapPastDays)} AND f.kickoff<=now()+${days(matchSitemapFutureDays)}`;
const eligibleFixtures=`SELECT f.* FROM fixtures f JOIN competitions c ON c.id=f.competition_id
  WHERE ${submittableCompetition} AND (${matchWindow} OR EXISTS(SELECT 1 FROM seo_autopilot_pages ap WHERE ap.fixture_id=f.id AND ap.state='PUBLISHED' AND ap.retain_indexable)) AND NOT EXISTS(SELECT 1 FROM sports_pending_fixtures p WHERE p.id=f.id)
  AND NOT EXISTS(SELECT 1 FROM seo_autopilot_pages ap WHERE ap.fixture_id=f.id AND ap.state IN ('PRODUCT_ONLY','NOINDEX'))`;
const eligibleTeams=`SELECT t.* FROM teams t WHERE NOT t.provider_placeholder AND (
  t.id IN (SELECT f.home_team_id FROM fixtures f JOIN competitions c ON c.id=f.competition_id WHERE ${submittableCompetition}
    UNION SELECT f.away_team_id FROM fixtures f JOIN competitions c ON c.id=f.competition_id WHERE ${submittableCompetition})
  OR t.id IN (SELECT sm.team_id FROM team_squad_memberships sm JOIN seasons s ON s.id=sm.season_id JOIN competitions c ON c.id=s.competition_id WHERE ${submittableCompetition}))`;
export const sitemapPlayerEligibilitySql=`SELECT p.* FROM players p WHERE EXISTS (
  SELECT 1 FROM team_squad_memberships sm JOIN seasons s ON s.id=sm.season_id JOIN competitions c ON c.id=s.competition_id
  WHERE sm.player_id=p.id AND c.enabled AND c.coverage_status IN ('SUPPORTED','SUPPORTED_BUT_NO_CURRENT_FIXTURES'))
  AND (EXISTS(SELECT 1 FROM player_season_statistics ps WHERE ps.player_id=p.id)
    OR EXISTS(SELECT 1 FROM fixture_lineups fl WHERE fl.player_entity_id=p.id)
    OR EXISTS(SELECT 1 FROM fixture_player_statistics fps WHERE fps.player_id=p.id))`;
const eligiblePlayers=sitemapPlayerEligibilitySql;
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
    const query=kind==='matches'?`${prefix} SELECT p.public_id,ht.name,at.name AS away,
      (SELECT ap.content_changed_at FROM seo_autopilot_pages ap WHERE ap.fixture_id=p.id AND ap.state='PUBLISHED') AS updated_at FROM page p
      JOIN teams ht ON ht.id=p.home_team_id JOIN teams at ON at.id=p.away_team_id ORDER BY p.id`
      :kind==='teams'?`${prefix}, changes AS (
        SELECT f.home_team_id AS id,f.updated_at AS stamp FROM fixtures f JOIN page p ON p.id=f.home_team_id
        UNION ALL SELECT f.away_team_id,f.updated_at FROM fixtures f JOIN page p ON p.id=f.away_team_id
        UNION ALL SELECT sm.team_id,sm.observed_at FROM team_squad_memberships sm JOIN page p ON p.id=sm.team_id),
        latest AS (SELECT id,max(stamp) AS stamp FROM changes GROUP BY id)
        SELECT p.public_id,p.name,GREATEST(p.updated_at,l.stamp) AS updated_at FROM page p LEFT JOIN latest l ON l.id=p.id ORDER BY p.id`
      :`${prefix} SELECT p.public_id,p.display_name AS name,GREATEST(p.updated_at,
        (SELECT max(ps.observed_at) FROM player_season_statistics ps WHERE ps.player_id=p.id),
        (SELECT max(fl.observed_at) FROM fixture_lineups fl WHERE fl.player_entity_id=p.id),
        (SELECT max(fps.observed_at) FROM fixture_player_statistics fps WHERE fps.player_id=p.id)) AS updated_at
        FROM page p ORDER BY p.id`;
    const result=await this.db.query(query,[limit,offset]);
    // Source observation timestamps on team/profile rows are not proof of a significant content change.
    return result.rows.map(row=>({publicId:String(row.public_id),name:String(row.name),...(row.away?{away:String(row.away)}:{}),updatedAt:row.updated_at?new Date(String(row.updated_at)):new Date(0),lastmodVerified:kind==='matches'&&!!row.updated_at}));
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
      FROM competitions c JOIN seasons s ON s.competition_id=c.id WHERE ${submittableCompetition}
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
