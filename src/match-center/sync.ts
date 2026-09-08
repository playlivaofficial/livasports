import { randomUUID } from 'node:crypto';
import type { DatabaseClient, QueryExecutor } from '@/database/client';
import type { SportmonksFixturePayload, SportmonksGateway, SportmonksStandingPayload } from '@/providers/sportmonks/types';
import { sanitizeText } from '@/providers/safe-error';

interface SyncTarget {
  fixtureId: string; providerFixtureId: string; seasonId: string | null; providerSeasonId: string | null;
  competitionId: string; competitionType: string; slug: string; status: string; homeTeamId: string; awayTeamId: string;
}

const sampleSlugs = ['brasileirao-serie-a', 'liga-mx', 'premier-league', 'copa-do-brasil', 'copa-libertadores'] as const;
const moduleState = (rows: readonly unknown[] | undefined, scheduled: boolean) => rows?.length ? 'AVAILABLE' : scheduled ? 'NOT_YET_AVAILABLE' : 'NO_DATA_IN_WINDOW';
export function canResumeSyncJob(job: { status:string; resumeCursor:number; leaseExpiresAt:Date }, total:number, now=new Date()): boolean {
  return job.resumeCursor > 0 && job.resumeCursor <= total &&
    (job.status === 'FAILED' || (job.status === 'RUNNING' && job.leaseExpiresAt.getTime() <= now.getTime()));
}

export class MatchCenterSyncService {
  constructor(private readonly database: DatabaseClient, private readonly gateway: SportmonksGateway) {}

  private async targets(): Promise<SyncTarget[]> {
    const result = await this.database.query<SyncTarget>(`WITH ranked AS (
      SELECT f.id AS "fixtureId",fm.provider_entity_id AS "providerFixtureId",f.season_id AS "seasonId",
      sm.provider_entity_id AS "providerSeasonId",f.competition_id AS "competitionId",c.competition_type AS "competitionType",
      c.slug,f.status,f.home_team_id AS "homeTeamId",f.away_team_id AS "awayTeamId",
      row_number() OVER (PARTITION BY c.slug ORDER BY
        CASE WHEN c.slug='copa-libertadores' AND f.status='SCHEDULED' THEN 0 WHEN f.status='FINISHED' THEN 0 ELSE 1 END,
        f.kickoff DESC) AS rank
      FROM fixtures f JOIN competitions c ON c.id=f.competition_id
      JOIN provider_entity_mappings fm ON fm.livasports_entity_id=f.id AND fm.provider='SPORTMONKS' AND fm.entity_type='FIXTURE'
      LEFT JOIN provider_entity_mappings sm ON sm.livasports_entity_id=f.season_id AND sm.provider='SPORTMONKS' AND sm.entity_type='SEASON'
      WHERE c.slug=ANY($1::text[])
    ) SELECT "fixtureId","providerFixtureId","seasonId","providerSeasonId","competitionId","competitionType",slug,status,"homeTeamId","awayTeamId"
      FROM ranked WHERE rank=1 ORDER BY array_position($1::text[],slug)`, [sampleSlugs]);
    return result.rows;
  }

  private async startJob(total: number): Promise<{ id: string; owner: string; cursor: number; requestBase: number; resumed: boolean }> {
    const owner = `m4-${process.pid}-${randomUUID()}`;
    return this.database.transaction(async db => {
      const active = await db.query(`SELECT id FROM match_center_sync_jobs WHERE status='RUNNING' AND lease_expires_at>now() FOR UPDATE`);
      if (active.rowCount) throw new Error('An active Match Center sync lease already exists');
      const latest = await db.query<{ id:string; status:string; resume_cursor:number; provider_requests:number; lease_expires_at:Date }>(`SELECT id,status,resume_cursor,provider_requests,lease_expires_at
        FROM match_center_sync_jobs WHERE total_fixtures=$1 ORDER BY started_at DESC LIMIT 1 FOR UPDATE`, [total]);
      const interrupted = latest.rows[0];
      if (interrupted && canResumeSyncJob({ status:interrupted.status,resumeCursor:interrupted.resume_cursor,
        leaseExpiresAt:new Date(interrupted.lease_expires_at) },total)) {
        await db.query(`UPDATE match_center_sync_jobs SET status='RUNNING',lease_owner=$2,lease_expires_at=now()+interval '5 minutes',
          heartbeat_at=now(),completed_at=NULL,error_message=NULL WHERE id=$1`, [interrupted.id, owner]);
        return { id: interrupted.id, owner, cursor: interrupted.resume_cursor, requestBase: interrupted.provider_requests, resumed: true };
      }
      await db.query(`UPDATE match_center_sync_jobs SET status='FAILED',completed_at=COALESCE(completed_at,now()),error_message=COALESCE(error_message,'Lease expired before completion')
        WHERE status='RUNNING' AND lease_expires_at<=now()`);
      const result = await db.query<{ id: string }>(`INSERT INTO match_center_sync_jobs(status,lease_owner,lease_expires_at,total_fixtures)
        VALUES ('RUNNING',$1,now()+interval '5 minutes',$2) RETURNING id`, [owner, total]);
      return { id: result.rows[0].id, owner, cursor: 0, requestBase: 0, resumed: false };
    });
  }

  private heartbeat(job: { id: string; owner: string; requestBase: number }, cursor: number) {
    return this.database.query(`UPDATE match_center_sync_jobs SET heartbeat_at=now(),lease_expires_at=now()+interval '5 minutes',
      resume_cursor=$3,processed_fixtures=$3,provider_requests=$4 WHERE id=$1 AND lease_owner=$2 AND status='RUNNING'`,
    [job.id, job.owner, cursor, job.requestBase + this.gateway.requestCount()]);
  }

  private async teamMap(providerIds: number[]): Promise<Map<number, string>> {
    const result = await this.database.query<{ provider_entity_id: string; livasports_entity_id: string }>(`SELECT provider_entity_id,livasports_entity_id
      FROM provider_entity_mappings WHERE provider='SPORTMONKS' AND entity_type='TEAM' AND provider_entity_id=ANY($1::text[])`,
    [providerIds.map(String)]);
    return new Map(result.rows.map(row => [Number(row.provider_entity_id), row.livasports_entity_id]));
  }

  private setState(db: QueryExecutor, fixtureId: string, module: string, state: string, providerUpdatedAt: string | null, requestCount: number, errorMessage: string | null = null) {
    return db.query(`INSERT INTO fixture_detail_sync_state(fixture_id,module,state,provider_updated_at,last_attempt_at,last_success_at,snapshot_at,request_count,error_message)
      VALUES ($1,$2,$3,$4,now(),CASE WHEN $3<>'ERROR' THEN now() END,CASE WHEN $3<>'ERROR' THEN now() END,$5,$6)
      ON CONFLICT(fixture_id,module) DO UPDATE SET state=EXCLUDED.state,provider_updated_at=EXCLUDED.provider_updated_at,
      last_attempt_at=now(),last_success_at=CASE WHEN EXCLUDED.state='ERROR' THEN fixture_detail_sync_state.last_success_at ELSE now() END,
      snapshot_at=CASE WHEN EXCLUDED.state='ERROR' THEN fixture_detail_sync_state.snapshot_at ELSE now() END,
      request_count=fixture_detail_sync_state.request_count+EXCLUDED.request_count,error_message=EXCLUDED.error_message`,
    [fixtureId, module, state, providerUpdatedAt, requestCount, errorMessage]);
  }

  private async persistHeader(target: SyncTarget, raw: SportmonksFixturePayload, teams: Map<number, string>) {
    const home = raw.participants?.find(row => row.meta?.location === 'home');
    const away = raw.participants?.find(row => row.meta?.location === 'away');
    if (!home || !away) throw new Error(`Fixture ${target.fixtureId} lacks explicit home/away roles`);
    if (teams.get(home.id) !== target.homeTeamId || teams.get(away.id) !== target.awayTeamId) throw new Error(`Fixture ${target.fixtureId} participant mapping does not match canonical teams`);
    await this.database.transaction(async db => {
      await db.query(`UPDATE fixtures SET season_name=$2,provider_round_id=$3,round_name=$4,provider_stage_id=$5,stage_name=$6,
        provider_group_id=$7,group_name=$8,venue_name=$9,venue_city=$10,provider_updated_at=COALESCE($11,provider_updated_at),updated_at=now() WHERE id=$1`,
      [target.fixtureId, raw.season?.name ?? null, raw.round?.id ?? null, raw.round?.name ?? null, raw.stage?.id ?? null, raw.stage?.name ?? null,
        raw.group?.id ?? null, raw.group?.name ?? null, raw.venue?.name ?? null, raw.venue?.city_name ?? null, raw.updated_at ?? null]);
      for (const score of raw.scores ?? []) {
        const teamId = typeof score.participant_id === 'number' ? teams.get(score.participant_id) : null;
        const scoreId = (score as { id?: number }).id;
        if (!teamId || !scoreId || !score.description) continue;
        await db.query(`INSERT INTO fixture_scores(fixture_id,provider_score_id,participant_id,description,goals,provider_updated_at,observed_at)
          VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(fixture_id,provider_score_id) DO UPDATE SET participant_id=EXCLUDED.participant_id,
          description=EXCLUDED.description,goals=EXCLUDED.goals,provider_updated_at=EXCLUDED.provider_updated_at,observed_at=now()`,
        [target.fixtureId, scoreId, teamId, score.description, score.score?.goals ?? null, raw.updated_at ?? null]);
      }
      await this.setState(db, target.fixtureId, 'HEADER', 'AVAILABLE', raw.updated_at ?? null, 1);
      await this.setState(db, target.fixtureId, 'SCORES', moduleState(raw.scores, target.status === 'SCHEDULED'), raw.updated_at ?? null, 0);
    });
  }

  private async persistEvents(target: SyncTarget, raw: SportmonksFixturePayload, teams: Map<number, string>) {
    await this.database.transaction(async db => {
      for (const row of raw.events ?? []) await db.query(`INSERT INTO fixture_events(fixture_id,provider_event_id,provider_type_id,event_type,period_id,detailed_period_id,
        minute,extra_minute,team_id,player_id,player_name,related_player_id,related_player_name,result,detail,sort_order,rescinded,provider_updated_at,observed_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now()) ON CONFLICT(fixture_id,provider_event_id) DO UPDATE SET
        provider_type_id=EXCLUDED.provider_type_id,event_type=EXCLUDED.event_type,period_id=EXCLUDED.period_id,detailed_period_id=EXCLUDED.detailed_period_id,
        minute=EXCLUDED.minute,extra_minute=EXCLUDED.extra_minute,team_id=EXCLUDED.team_id,player_id=EXCLUDED.player_id,player_name=EXCLUDED.player_name,
        related_player_id=EXCLUDED.related_player_id,related_player_name=EXCLUDED.related_player_name,result=EXCLUDED.result,detail=EXCLUDED.detail,
        sort_order=EXCLUDED.sort_order,rescinded=EXCLUDED.rescinded,provider_updated_at=EXCLUDED.provider_updated_at,observed_at=now()`,
      [target.fixtureId,row.id,row.type_id ?? null,row.type?.name ?? row.type?.developer_name ?? 'UNKNOWN',row.period_id ?? null,row.detailed_period_id ?? null,
        row.minute ?? null,row.extra_minute ?? null,row.participant_id ? teams.get(row.participant_id) ?? null : null,row.player_id ?? null,row.player_name?.trim() ?? null,
        row.related_player_id ?? null,row.related_player_name?.trim() ?? null,row.result ?? null,row.info ?? row.addition ?? null,row.sort_order ?? null,
        row.rescinded ?? false,raw.updated_at ?? null]);
      await this.setState(db,target.fixtureId,'EVENTS',moduleState(raw.events,target.status==='SCHEDULED'),raw.updated_at ?? null,0);
    });
  }

  private async persistStatistics(target: SyncTarget, raw: SportmonksFixturePayload, teams: Map<number, string>) {
    await this.database.transaction(async db => {
      for (const row of raw.statistics ?? []) {
        const value = row.data?.value; const numeric = typeof value === 'number' ? value : null; const textual = typeof value === 'string' ? value : null;
        const name = row.type?.name ?? row.type?.developer_name ?? 'UNKNOWN'; const unit = /possession/i.test(name) ? '%' : null;
        await db.query(`INSERT INTO fixture_statistics(fixture_id,provider_statistic_id,provider_type_id,statistic_type,team_id,location,value_numeric,value_text,unit,period_scope,provider_updated_at,observed_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'MATCH',$10,now()) ON CONFLICT(fixture_id,provider_statistic_id) DO UPDATE SET provider_type_id=EXCLUDED.provider_type_id,
          statistic_type=EXCLUDED.statistic_type,team_id=EXCLUDED.team_id,location=EXCLUDED.location,value_numeric=EXCLUDED.value_numeric,value_text=EXCLUDED.value_text,
          unit=EXCLUDED.unit,period_scope=EXCLUDED.period_scope,provider_updated_at=EXCLUDED.provider_updated_at,observed_at=now()`,
        [target.fixtureId,row.id,row.type_id ?? null,name,row.participant_id ? teams.get(row.participant_id) ?? null : null,row.location ?? null,numeric,textual,unit,raw.updated_at ?? null]);
      }
      await this.setState(db,target.fixtureId,'STATISTICS',moduleState(raw.statistics,target.status==='SCHEDULED'),raw.updated_at ?? null,0);
    });
  }

  private async persistLineups(target: SyncTarget, raw: SportmonksFixturePayload, teams: Map<number, string>) {
    await this.database.transaction(async db => {
      for (const row of raw.lineups ?? []) {
        const teamId = row.team_id ? teams.get(row.team_id) : null; if (!teamId || !row.player_name) continue;
        await db.query(`INSERT INTO fixture_lineups(fixture_id,provider_lineup_id,team_id,provider_player_id,player_name,lineup_type,position_id,formation_field,formation_position,jersey_number,provider_updated_at,observed_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) ON CONFLICT(fixture_id,provider_lineup_id) DO UPDATE SET team_id=EXCLUDED.team_id,
          provider_player_id=EXCLUDED.provider_player_id,player_name=EXCLUDED.player_name,lineup_type=EXCLUDED.lineup_type,position_id=EXCLUDED.position_id,
          formation_field=EXCLUDED.formation_field,formation_position=EXCLUDED.formation_position,jersey_number=EXCLUDED.jersey_number,
          provider_updated_at=EXCLUDED.provider_updated_at,observed_at=now()`, [target.fixtureId,row.id,teamId,row.player_id ?? null,row.player_name.trim(),
          row.type_id===11?'STARTER':row.type_id===12?'SUBSTITUTE':'UNKNOWN',row.position_id ?? null,row.formation_field ?? null,row.formation_position ?? null,
          row.jersey_number ?? null,raw.updated_at ?? null]);
      }
      for (const row of raw.formations ?? []) { const teamId = row.participant_id ? teams.get(row.participant_id) : null; if (!teamId || !row.formation) continue;
        await db.query(`INSERT INTO fixture_formations(fixture_id,team_id,formation,provider_updated_at,observed_at) VALUES($1,$2,$3,$4,now())
          ON CONFLICT(fixture_id,team_id) DO UPDATE SET formation=EXCLUDED.formation,provider_updated_at=EXCLUDED.provider_updated_at,observed_at=now()`,
        [target.fixtureId,teamId,row.formation,raw.updated_at ?? null]); }
      for (const row of raw.coaches ?? []) { const teamId = row.participant_id ? teams.get(row.participant_id) : null; const name = row.coach?.common_name ?? row.coach?.display_name ?? row.coach?.name;
        if (!teamId || !name) continue; await db.query(`INSERT INTO fixture_coaches(fixture_id,team_id,provider_coach_id,coach_name,provider_updated_at,observed_at)
          VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(fixture_id,team_id) DO UPDATE SET provider_coach_id=EXCLUDED.provider_coach_id,coach_name=EXCLUDED.coach_name,
          provider_updated_at=EXCLUDED.provider_updated_at,observed_at=now()`,[target.fixtureId,teamId,row.coach_id ?? row.coach?.id ?? null,name,raw.updated_at ?? null]); }
      await this.setState(db,target.fixtureId,'LINEUPS',moduleState(raw.lineups,target.status==='SCHEDULED'),raw.updated_at ?? null,0);
    });
  }

  private detailProviderTeamIds(raw: SportmonksFixturePayload): number[] {
    return [...new Set([...(raw.participants ?? []).map(row=>row.id),...(raw.events ?? []).flatMap(row=>row.participant_id?[row.participant_id]:[]),
      ...(raw.statistics ?? []).flatMap(row=>row.participant_id?[row.participant_id]:[]),...(raw.lineups ?? []).flatMap(row=>row.team_id?[row.team_id]:[]),
      ...(raw.formations ?? []).flatMap(row=>row.participant_id?[row.participant_id]:[]),...(raw.coaches ?? []).flatMap(row=>row.participant_id?[row.participant_id]:[])])];
  }

  private standingValue(row: SportmonksStandingPayload, id: number): number | null {
    const value=row.details?.find(item=>item.type_id===id)?.value; return typeof value==='number'?value:typeof value==='string'&&value.trim()!==''?Number(value):null;
  }

  private async persistStandings(target: SyncTarget, rows: SportmonksStandingPayload[], teams: Map<number,string>) {
    await this.database.transaction(async db => {
      for (const row of rows) { const teamId=teams.get(row.participant_id); if(!teamId||!target.seasonId) continue;
        const gf=this.standingValue(row,133),ga=this.standingValue(row,134);
        await db.query(`INSERT INTO standings_current(season_id,stage_id,group_id,team_id,provider_standing_id,competition_id,stage_name,group_name,position,played,won,drawn,lost,goals_for,goals_against,goal_difference,points,observed_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now()) ON CONFLICT(season_id,stage_id,group_id,team_id) DO UPDATE SET
          provider_standing_id=EXCLUDED.provider_standing_id,competition_id=EXCLUDED.competition_id,stage_name=EXCLUDED.stage_name,group_name=EXCLUDED.group_name,
          position=EXCLUDED.position,played=EXCLUDED.played,won=EXCLUDED.won,drawn=EXCLUDED.drawn,lost=EXCLUDED.lost,goals_for=EXCLUDED.goals_for,
          goals_against=EXCLUDED.goals_against,goal_difference=EXCLUDED.goal_difference,points=EXCLUDED.points,observed_at=now()`,
        [target.seasonId,row.stage_id??0,row.group_id??0,teamId,row.id,target.competitionId,row.stage?.name??null,row.group?.name??null,row.position,
          this.standingValue(row,129),this.standingValue(row,130),this.standingValue(row,131),this.standingValue(row,132),gf,ga,gf!==null&&ga!==null?gf-ga:null,row.points??null]); }
      const state=rows.length?'AVAILABLE':target.competitionType==='DOMESTIC_CUP'?'NOT_APPLICABLE':'NO_DATA_IN_WINDOW';
      await this.setState(db,target.fixtureId,'STANDINGS',state,null,1);
    });
  }

  async runSample(): Promise<{ jobId: string; resumed: boolean; resumeCursor: number; fixtures: Array<{ slug:string; fixtureId:string; modules:Record<string,string> }>; providerRequests: number }> {
    const targets=await this.targets(); if(targets.length!==sampleSlugs.length) throw new Error(`Expected ${sampleSlugs.length} representative fixtures, found ${targets.length}`);
    const job=await this.startJob(targets.length); const report: Array<{slug:string;fixtureId:string;modules:Record<string,string>}> = [];
    try {
      for(let index=job.cursor;index<targets.length;index++) { const target=targets[index]; const raw=await this.gateway.fixtureDetails(target.providerFixtureId);
        if(!raw) throw new Error(`Fixture detail unavailable for canonical fixture ${target.fixtureId}`);
        const teams=await this.teamMap(this.detailProviderTeamIds(raw));
        const modules: Record<string,string>={};
        const tasks=[['HEADER',()=>this.persistHeader(target,raw,teams)],['EVENTS',()=>this.persistEvents(target,raw,teams)],
          ['STATISTICS',()=>this.persistStatistics(target,raw,teams)],['LINEUPS',()=>this.persistLineups(target,raw,teams)]] as const;
        for(const [name,task] of tasks) { try { await task(); modules[name]='PASS'; } catch(error) { modules[name]='ERROR'; const message=sanitizeText(error instanceof Error?error.message:'Module persistence failed', []);
          await this.setState(this.database,target.fixtureId,name,'ERROR',raw.updated_at??null,0,message); } }
        report.push({slug:target.slug,fixtureId:target.fixtureId,modules}); await this.heartbeat(job,index+1);
      }
      for(const target of targets) { if(!target.providerSeasonId) { await this.persistStandings(target,[],new Map()); continue; }
        try { const rows=await this.gateway.standings(target.providerSeasonId); const teams=await this.teamMap(rows.map(row=>row.participant_id)); await this.persistStandings(target,rows,teams); }
        catch(error) { await this.setState(this.database,target.fixtureId,'STANDINGS','ERROR',null,1,sanitizeText(error instanceof Error?error.message:'Standings request failed', [])); } }
      const providerRequests=job.requestBase+this.gateway.requestCount();
      await this.database.query(`UPDATE match_center_sync_jobs SET status='SUCCEEDED',completed_at=now(),lease_expires_at=now(),provider_requests=$2 WHERE id=$1`,[job.id,providerRequests]);
      return {jobId:job.id,resumed:job.resumed,resumeCursor:job.cursor,fixtures:report,providerRequests};
    } catch(error) { await this.database.query(`UPDATE match_center_sync_jobs SET status='FAILED',completed_at=now(),lease_expires_at=now(),provider_requests=$2,error_message=$3 WHERE id=$1`,
      [job.id,job.requestBase+this.gateway.requestCount(),sanitizeText(error instanceof Error?error.message:'M4 sync failed', [])]); throw error; }
  }
}
