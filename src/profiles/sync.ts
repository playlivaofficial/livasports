import { randomUUID } from 'node:crypto';
import type { DatabaseClient, QueryExecutor } from '@/database/client';
import { sanitizeText } from '@/providers/safe-error';
import type { ProfileDataProvider, ProviderPlayer, ProviderSeasonStatistic, ProviderSquadRow, ProviderStatisticDetail, ProviderTeamProfile } from './provider';

interface ProfileTarget {
  role: string;
  slug: string;
  teamId: string;
  teamPublicId: string;
  teamName: string;
  providerTeamId: string;
  seasonId: string;
  seasonName: string;
  providerSeasonId: string;
  competitionId: string;
  fixtureId: string | null;
  providerFixtureId: string | null;
}
interface CanonicalPlayer { id: string; publicId: string; providerPlayerId: string; teamId: string; seasonId: string; competitionId: string; positionId: number | null; }
interface Counts { inserted: number; updated: number; }
const emptyCounts = (): Counts => ({ inserted: 0, updated: 0 });
const addCounts = (left: Counts, right: Counts) => { left.inserted += right.inserted; left.updated += right.updated; };

function playerName(raw: ProviderPlayer | undefined, fallback: string): string {
  return (raw?.display_name || raw?.name || raw?.common_name || fallback).trim();
}
function coachName(raw: ProviderTeamProfile): string | null {
  const current = raw.coaches?.find(row => row.active === true || (!row.end && Boolean(row.start)));
  return (current?.common_name || current?.display_name || current?.name || current?.coach?.common_name
    || current?.coach?.display_name || current?.coach?.name || '').trim() || null;
}
function validDate(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function selectRepresentativePlayers(rows: readonly ProviderSquadRow[], limit = 4): ProviderSquadRow[] {
  const positions = [24, 25, 26, 27];
  const selected = positions.flatMap(position => rows.find(row => row.position_id === position) ?? []).slice(0, limit);
  if (selected.length < limit) for (const row of rows) {
    if (selected.some(item => item.player_id === row.player_id)) continue;
    selected.push(row);
    if (selected.length === limit) break;
  }
  return selected;
}

export class ProfileSyncService {
  constructor(private readonly database: DatabaseClient, private readonly provider: ProfileDataProvider) {}

  private async targets(): Promise<ProfileTarget[]> {
    const result = await this.database.query<ProfileTarget>(`WITH requested(slug,team_name,role,sort) AS (VALUES
        ('brasileirao-serie-a','Flamengo','Brazil current major',1),('liga-mx','América','Liga MX',2),('premier-league','Fulham','Major Europe',3)
      ), ranked AS (SELECT r.role,r.sort,c.slug,t.id AS "teamId",t.public_id AS "teamPublicId",t.name AS "teamName",
        tm.provider_entity_id AS "providerTeamId",s.id AS "seasonId",s.name AS "seasonName",sm.provider_entity_id AS "providerSeasonId",
        c.id AS "competitionId",fx.fixture_id AS "fixtureId",fx.provider_fixture_id AS "providerFixtureId",
        row_number() OVER(PARTITION BY r.slug,r.team_name ORDER BY s.is_current DESC,s.starts_at DESC NULLS LAST) AS rank
        FROM requested r JOIN competitions c ON c.slug=r.slug JOIN teams t ON t.name=r.team_name
        JOIN team_seasons ts ON ts.team_id=t.id JOIN seasons s ON s.id=ts.season_id AND s.competition_id=c.id
        JOIN provider_entity_mappings tm ON tm.provider='SPORTMONKS' AND tm.entity_type='TEAM' AND tm.livasports_entity_id=t.id
        JOIN provider_entity_mappings sm ON sm.provider='SPORTMONKS' AND sm.entity_type='SEASON' AND sm.livasports_entity_id=s.id
        LEFT JOIN LATERAL (SELECT f.id AS fixture_id,fm.provider_entity_id AS provider_fixture_id FROM fixtures f
          JOIN provider_entity_mappings fm ON fm.provider='SPORTMONKS' AND fm.entity_type='FIXTURE' AND fm.livasports_entity_id=f.id
          WHERE f.competition_id=c.id AND t.id IN(f.home_team_id,f.away_team_id) AND f.status='FINISHED' ORDER BY f.kickoff DESC LIMIT 1) fx ON true)
      SELECT role,slug,"teamId","teamPublicId","teamName","providerTeamId","seasonId","seasonName","providerSeasonId","competitionId","fixtureId","providerFixtureId"
      FROM ranked WHERE rank=1 ORDER BY sort`);
    if (result.rows.length !== 3) throw new Error(`Expected 3 mapped profile targets, found ${result.rows.length}`);
    return result.rows;
  }

  private async startJob(total: number) {
    const owner = `m4.1-${process.pid}-${randomUUID()}`;
    return this.database.transaction(async db => {
      const active = await db.query('SELECT id FROM profile_sync_jobs WHERE status=\'RUNNING\' AND lease_expires_at>now() FOR UPDATE');
      if (active.rowCount) throw new Error('An active profile sync lease already exists');
      await db.query(`UPDATE profile_sync_jobs SET status='FAILED',completed_at=now(),error_message=COALESCE(error_message,'Lease expired before completion')
        WHERE status='RUNNING' AND lease_expires_at<=now()`);
      const result = await db.query<{ id: string }>(`INSERT INTO profile_sync_jobs(status,target_key,lease_owner,lease_expires_at,total_targets)
        VALUES('RUNNING','M4.1_CONTROLLED_SAMPLE',$1,now()+interval '10 minutes',$2) RETURNING id`, [owner, total]);
      return { id: result.rows[0].id, owner };
    });
  }

  private heartbeat(job: { id: string; owner: string }, processed: number, counts: Counts) {
    return this.database.query(`UPDATE profile_sync_jobs SET heartbeat_at=now(),lease_expires_at=now()+interval '10 minutes',resume_cursor=$3,
      processed_targets=$3,provider_requests=$4,records_inserted=$5,records_updated=$6 WHERE id=$1 AND lease_owner=$2 AND status='RUNNING'`,
    [job.id, job.owner, processed, this.provider.requestCount(), counts.inserted, counts.updated]);
  }

  private state(db: QueryExecutor, entityType: 'TEAM' | 'PLAYER', entityId: string, module: string, state: string,
    requests: number, error: string | null = null) {
    return db.query(`INSERT INTO profile_sync_state(entity_type,entity_id,module,state,last_attempt_at,last_success_at,snapshot_at,request_count,error_message)
      VALUES($1,$2,$3,$4,now(),CASE WHEN $4<>'ERROR' THEN now() END,CASE WHEN $4<>'ERROR' THEN now() END,$5,$6)
      ON CONFLICT(entity_type,entity_id,module) DO UPDATE SET state=EXCLUDED.state,last_attempt_at=now(),
      last_success_at=CASE WHEN EXCLUDED.state='ERROR' THEN profile_sync_state.last_success_at ELSE now() END,
      snapshot_at=CASE WHEN EXCLUDED.state='ERROR' THEN profile_sync_state.snapshot_at ELSE now() END,
      request_count=profile_sync_state.request_count+EXCLUDED.request_count,error_message=EXCLUDED.error_message`,
    [entityType, entityId, module, state, requests, error]);
  }

  private statisticPayload(details: readonly ProviderStatisticDetail[], providerUpdatedAt: string | null = null) {
    return details.flatMap(detail => { const value=detail.value??detail.data; return detail.type_id && detail.type?.name && value && typeof value === 'object' ? [{
      provider_type_id: detail.type_id, name: detail.type.name, developer_name: detail.type.developer_name ?? null,
      model_type: detail.type.model_type ?? 'statistic', stat_group: detail.type.stat_group ?? null,
      value_shape: Object.keys(value).sort(), provider_statistic_id: detail.id ?? detail.type_id,
      value, provider_updated_at: providerUpdatedAt,
    }] : []; });
  }

  private async persistTypes(db: QueryExecutor, rows: ReturnType<ProfileSyncService['statisticPayload']>) {
    const uniqueRows = [...new Map(rows.map(row => [row.provider_type_id, row])).values()];
    if (!uniqueRows.length) return;
    await db.query(`WITH input AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(provider_type_id integer,name text,
      developer_name text,model_type text,stat_group text,value_shape jsonb))
      INSERT INTO profile_statistic_types(provider,provider_type_id,name,developer_name,model_type,stat_group,value_shape)
      SELECT 'SPORTMONKS',provider_type_id,name,developer_name,model_type,stat_group,value_shape FROM input
      ON CONFLICT(provider,provider_type_id) DO UPDATE SET name=EXCLUDED.name,developer_name=EXCLUDED.developer_name,
      model_type=EXCLUDED.model_type,stat_group=EXCLUDED.stat_group,value_shape=EXCLUDED.value_shape,updated_at=now()`, [JSON.stringify(uniqueRows)]);
  }

  private async persistTeam(target: ProfileTarget, raw: ProviderTeamProfile): Promise<Counts> {
    const statistics = (raw.statistics ?? []).flatMap(row => this.statisticPayload(row.details ?? []));
    return this.database.transaction(async db => {
      const updated = await db.query(`UPDATE teams SET short_name=COALESCE($2,short_name),image_url=COALESCE($3,image_url),founded_year=$4,
        venue_name=$5,venue_city=$6,coach_name=$7,profile_state=$8,profile_updated_at=now(),updated_at=now() WHERE id=$1`,
      [target.teamId, raw.short_code ?? null, raw.image_path ?? null, raw.founded ?? null, raw.venue?.name ?? null,
        raw.venue?.city_name ?? raw.venue?.city?.name ?? null, coachName(raw), statistics.length ? 'AVAILABLE' : 'PARTIAL']);
      await this.persistTypes(db, statistics);
      if (statistics.length) await db.query(`WITH input AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(provider_statistic_id bigint,
        provider_type_id integer,value jsonb,provider_updated_at timestamptz))
        INSERT INTO team_season_statistics(team_id,season_id,competition_id,provider_statistic_id,provider_type_id,value,provider_updated_at,observed_at)
        SELECT $2,$3,$4,provider_statistic_id,provider_type_id,value,provider_updated_at,now() FROM input
        ON CONFLICT(team_id,season_id,provider_type_id) DO UPDATE SET provider_statistic_id=EXCLUDED.provider_statistic_id,
        competition_id=EXCLUDED.competition_id,value=EXCLUDED.value,provider_updated_at=EXCLUDED.provider_updated_at,observed_at=now()`,
      [JSON.stringify(statistics), target.teamId, target.seasonId, target.competitionId]);
      await this.state(db, 'TEAM', target.teamId, 'IDENTITY', 'AVAILABLE', 0);
      await this.state(db, 'TEAM', target.teamId, 'METADATA', raw.venue || raw.founded ? 'AVAILABLE' : 'PARTIAL', 1);
      await this.state(db, 'TEAM', target.teamId, 'COMPETITIONS', 'AVAILABLE', 0);
      await this.state(db, 'TEAM', target.teamId, 'MATCHES', 'AVAILABLE', 0);
      await this.state(db, 'TEAM', target.teamId, 'STATISTICS', statistics.length ? 'AVAILABLE' : 'NOT_COVERED', 0);
      return { inserted: 0, updated: updated.rowCount ?? 0 };
    });
  }

  private async persistSquad(target: ProfileTarget, rows: readonly ProviderSquadRow[]): Promise<{ counts: Counts; players: CanonicalPlayer[] }> {
    if (!rows.length) {
      await this.state(this.database, 'TEAM', target.teamId, 'SQUAD', 'NOT_COVERED', 1);
      return { counts: emptyCounts(), players: [] };
    }
    const ids = [...new Set(rows.map(row => String(row.player_id)))];
    const existing = await this.database.query<{ provider_player_id: string; player_id: string; public_id: string }>(`SELECT m.provider_player_id,m.player_id,p.public_id
      FROM player_provider_mappings m JOIN players p ON p.id=m.player_id WHERE m.provider='SPORTMONKS' AND m.provider_player_id=ANY($1::text[])`, [ids]);
    const mapped = new Map(existing.rows.map(row => [row.provider_player_id, { id: row.player_id, publicId: row.public_id }]));
    const payload = rows.map(row => {
      const current = mapped.get(String(row.player_id));
      const id = current?.id ?? randomUUID();
      const publicId = current?.publicId ?? id.replaceAll('-', '').slice(0, 16).toLowerCase();
      const raw = row.player;
      return { id, public_id: publicId, provider_player_id: String(row.player_id), name: playerName(raw, `Player ${row.player_id}`),
        common_name: raw?.common_name?.trim() || null, firstname: raw?.firstname?.trim() || null, lastname: raw?.lastname?.trim() || null,
        image_url: raw?.image_path ?? null, position_id: raw?.position_id ?? row.position_id ?? null,
        position_name: row.position?.name ?? null, detailed_position_id: raw?.detailed_position_id ?? row.detailed_position_id ?? null,
        date_of_birth: validDate(raw?.date_of_birth), height_cm: raw?.height ?? null, weight_kg: raw?.weight ?? null, gender: raw?.gender ?? null,
        provider_squad_id: row.id, jersey_number: row.jersey_number ?? null, starts_at: validDate(row.start), ends_at: validDate(row.end) };
    });
    const insertedPlayers = payload.filter(row => !mapped.has(row.provider_player_id)).length;
    await this.database.transaction(async db => {
      await db.query(`WITH input AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(id uuid,public_id text,provider_player_id text,name text,
        common_name text,firstname text,lastname text,image_url text,position_id integer,position_name text,detailed_position_id integer,
        date_of_birth date,height_cm integer,weight_kg integer,gender text))
        INSERT INTO players(id,public_id,sport_id,name,display_name,common_name,firstname,lastname,image_url,position_id,position_name,
          detailed_position_id,date_of_birth,height_cm,weight_kg,gender,profile_state,observed_at)
        SELECT id,public_id,'4b6ca767-90b1-4275-ad70-fc25c40f8352',name,name,common_name,firstname,lastname,image_url,position_id,
          position_name,detailed_position_id,date_of_birth,height_cm,weight_kg,gender,'PARTIAL',now() FROM input
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,display_name=EXCLUDED.display_name,common_name=COALESCE(EXCLUDED.common_name,players.common_name),
          firstname=COALESCE(EXCLUDED.firstname,players.firstname),lastname=COALESCE(EXCLUDED.lastname,players.lastname),image_url=COALESCE(EXCLUDED.image_url,players.image_url),
          position_id=COALESCE(EXCLUDED.position_id,players.position_id),position_name=COALESCE(EXCLUDED.position_name,players.position_name),
          detailed_position_id=COALESCE(EXCLUDED.detailed_position_id,players.detailed_position_id),date_of_birth=COALESCE(EXCLUDED.date_of_birth,players.date_of_birth),
          height_cm=COALESCE(EXCLUDED.height_cm,players.height_cm),weight_kg=COALESCE(EXCLUDED.weight_kg,players.weight_kg),gender=COALESCE(EXCLUDED.gender,players.gender),
          observed_at=now(),updated_at=now()`, [JSON.stringify(payload)]);
      await db.query(`WITH input AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(id uuid,provider_player_id text))
        INSERT INTO player_provider_mappings(provider,provider_player_id,player_id) SELECT 'SPORTMONKS',provider_player_id,id FROM input
        ON CONFLICT(provider,provider_player_id) DO UPDATE SET player_id=EXCLUDED.player_id,updated_at=now()`, [JSON.stringify(payload)]);
      await db.query(`WITH input AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(id uuid,provider_squad_id bigint,position_id integer,
        position_name text,detailed_position_id integer,jersey_number integer,starts_at date,ends_at date))
        INSERT INTO team_squad_memberships(team_id,season_id,player_id,provider_squad_id,position_id,position_name,detailed_position_id,
          jersey_number,starts_at,ends_at,observed_at)
        SELECT $2,$3,id,provider_squad_id,position_id,position_name,detailed_position_id,jersey_number,starts_at,ends_at,now() FROM input
        ON CONFLICT(team_id,season_id,player_id) DO UPDATE SET provider_squad_id=EXCLUDED.provider_squad_id,position_id=EXCLUDED.position_id,
          position_name=EXCLUDED.position_name,detailed_position_id=EXCLUDED.detailed_position_id,jersey_number=EXCLUDED.jersey_number,
          starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,observed_at=now()`, [JSON.stringify(payload), target.teamId, target.seasonId]);
      await this.state(db, 'TEAM', target.teamId, 'SQUAD', 'AVAILABLE', 1);
    });
    return { counts: { inserted: insertedPlayers, updated: payload.length - insertedPlayers }, players: payload.map(row => ({ id: row.id,
      publicId: row.public_id, providerPlayerId: row.provider_player_id, teamId: target.teamId, seasonId: target.seasonId,
      competitionId: target.competitionId, positionId: row.position_id })) };
  }

  private async persistPlayer(player: CanonicalPlayer, raw: ProviderPlayer): Promise<Counts> {
    const statisticRows = (raw.statistics ?? []).flatMap((statistic: ProviderSeasonStatistic) => this.statisticPayload(statistic.details ?? []));
    const [teamMappings, seasonMappings] = await Promise.all([
      this.database.query<{ provider_entity_id: string; livasports_entity_id: string }>(`SELECT provider_entity_id,livasports_entity_id
        FROM provider_entity_mappings WHERE provider='SPORTMONKS' AND entity_type='TEAM'`),
      this.database.query<{ provider_entity_id: string; season_id: string; competition_id: string }>(`SELECT pem.provider_entity_id,
        s.id AS season_id,s.competition_id FROM provider_entity_mappings pem JOIN seasons s ON s.id=pem.livasports_entity_id
        WHERE pem.provider='SPORTMONKS' AND pem.entity_type='SEASON'`),
    ]);
    const teamMap = new Map(teamMappings.rows.map(row => [row.provider_entity_id, row.livasports_entity_id]));
    const seasonMap = new Map(seasonMappings.rows.map(row => [row.provider_entity_id,
      { seasonId: row.season_id, competitionId: row.competition_id }]));
    return this.database.transaction(async db => {
      const updated = await db.query(`UPDATE players SET common_name=COALESCE($2,common_name),firstname=COALESCE($3,firstname),
        lastname=COALESCE($4,lastname),name=$5,display_name=$5,image_url=COALESCE($6,image_url),country_name=$7,nationality_name=$8,
        position_id=COALESCE($9,position_id),position_name=COALESCE($10,position_name),detailed_position_id=COALESCE($11,detailed_position_id),
        detailed_position_name=$12,date_of_birth=COALESCE($13,date_of_birth),height_cm=COALESCE($14,height_cm),weight_kg=COALESCE($15,weight_kg),
        gender=COALESCE($16,gender),profile_state=$17,provider_updated_at=now(),observed_at=now(),updated_at=now() WHERE id=$1`,
      [player.id, raw.common_name?.trim() || null, raw.firstname?.trim() || null, raw.lastname?.trim() || null,
        playerName(raw, `Player ${raw.id}`), raw.image_path ?? null, raw.country?.name ?? null, raw.nationality?.name ?? null,
        raw.position_id ?? null, raw.position?.name ?? null, raw.detailed_position_id ?? null, raw.detailedPosition?.name ?? null,
        validDate(raw.date_of_birth), raw.height ?? null, raw.weight ?? null, raw.gender ?? null, statisticRows.length ? 'AVAILABLE' : 'PARTIAL']);
      await this.persistTypes(db, statisticRows);
      for (const statistic of raw.statistics ?? []) {
        const canonicalTeam = statistic.team_id ? teamMap.get(String(statistic.team_id)) : null;
        const canonicalSeason = statistic.season_id ? seasonMap.get(String(statistic.season_id)) : null;
        if (!canonicalTeam || !canonicalSeason) continue;
        const details = this.statisticPayload(statistic.details ?? []);
        if (!details.length) continue;
        await db.query(`WITH input AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(provider_statistic_id bigint,provider_type_id integer,value jsonb,provider_updated_at timestamptz))
          INSERT INTO player_season_statistics(player_id,team_id,season_id,competition_id,provider_statistic_id,provider_type_id,value,provider_updated_at,observed_at)
          SELECT $2,$3,$4,$5,provider_statistic_id,provider_type_id,value,provider_updated_at,now() FROM input
          ON CONFLICT(player_id,team_id,season_id,provider_type_id) DO UPDATE SET provider_statistic_id=EXCLUDED.provider_statistic_id,
          competition_id=EXCLUDED.competition_id,value=EXCLUDED.value,provider_updated_at=EXCLUDED.provider_updated_at,observed_at=now()`,
        [JSON.stringify(details), player.id, canonicalTeam, canonicalSeason.seasonId, canonicalSeason.competitionId]);
      }
      await this.state(db, 'PLAYER', player.id, 'IDENTITY', 'AVAILABLE', 1);
      await this.state(db, 'PLAYER', player.id, 'STATISTICS', statisticRows.length ? 'AVAILABLE' : 'NOT_COVERED', 0);
      await this.state(db, 'PLAYER', player.id, 'MATCH_LOG', 'NOT_YET_INGESTED', 0);
      return { inserted: 0, updated: updated.rowCount ?? 0 };
    });
  }

  private async linkFixturePlayers() {
    await this.database.transaction(async db => {
      await db.query(`WITH source AS (
          SELECT DISTINCT ON (provider_player_id) provider_player_id,player_name FROM (
            SELECT provider_player_id::text AS provider_player_id,trim(player_name) AS player_name,observed_at
              FROM fixture_lineups WHERE provider_player_id IS NOT NULL AND trim(player_name)<>''
            UNION ALL
            SELECT player_id::text,trim(player_name),observed_at FROM fixture_events
              WHERE player_id IS NOT NULL AND player_name IS NOT NULL AND trim(player_name)<>''
            UNION ALL
            SELECT related_player_id::text,trim(related_player_name),observed_at FROM fixture_events
              WHERE related_player_id IS NOT NULL AND related_player_name IS NOT NULL AND trim(related_player_name)<>''
          ) identities ORDER BY provider_player_id,observed_at DESC
        ), candidates AS MATERIALIZED (
          SELECT gen_random_uuid() AS id,s.provider_player_id,s.player_name FROM source s
          WHERE NOT EXISTS (SELECT 1 FROM player_provider_mappings pm
            WHERE pm.provider='SPORTMONKS' AND pm.provider_player_id=s.provider_player_id)
        ), inserted AS (
          INSERT INTO players(id,public_id,sport_id,name,display_name,profile_state,observed_at)
          SELECT id,lower(substr(replace(id::text,'-',''),1,16)),'4b6ca767-90b1-4275-ad70-fc25c40f8352',
            player_name,player_name,'PARTIAL',now() FROM candidates RETURNING id
        ) INSERT INTO player_provider_mappings(provider,provider_player_id,player_id)
          SELECT 'SPORTMONKS',c.provider_player_id,c.id FROM candidates c JOIN inserted i ON i.id=c.id
          ON CONFLICT(provider,provider_player_id) DO NOTHING`);
      await db.query(`UPDATE fixture_lineups fl SET player_entity_id=pm.player_id FROM player_provider_mappings pm
        WHERE pm.provider='SPORTMONKS' AND pm.provider_player_id=fl.provider_player_id::text AND fl.player_entity_id IS DISTINCT FROM pm.player_id`);
      await db.query(`UPDATE fixture_events fe SET player_entity_id=pm.player_id FROM player_provider_mappings pm
        WHERE pm.provider='SPORTMONKS' AND pm.provider_player_id=fe.player_id::text AND fe.player_entity_id IS DISTINCT FROM pm.player_id`);
      await db.query(`UPDATE fixture_events fe SET related_player_entity_id=pm.player_id FROM player_provider_mappings pm
        WHERE pm.provider='SPORTMONKS' AND pm.provider_player_id=fe.related_player_id::text AND fe.related_player_entity_id IS DISTINCT FROM pm.player_id`);
      await db.query(`INSERT INTO profile_sync_state(entity_type,entity_id,module,state,last_attempt_at,last_success_at,snapshot_at,request_count)
        SELECT 'PLAYER',fl.player_entity_id,'MATCH_LOG','AVAILABLE',now(),now(),now(),0 FROM fixture_lineups fl
        WHERE fl.player_entity_id IS NOT NULL GROUP BY fl.player_entity_id
        ON CONFLICT(entity_type,entity_id,module) DO UPDATE SET state='AVAILABLE',last_success_at=now(),snapshot_at=now(),error_message=NULL`);
    });
  }

  async linkPersistedFixturePlayers() {
    await this.linkFixturePlayers();
    return { providerRequests: this.provider.requestCount() };
  }

  private async persistFixturePlayerStatistics(target: ProfileTarget, rows: readonly ProviderSquadRow[]): Promise<Counts> {
    if (!target.fixtureId || !rows.length) return emptyCounts();
    const providerPlayerIds = [...new Set(rows.map(row => String(row.player_id)))];
    const [players, teams] = await Promise.all([
      this.database.query<{ provider_player_id:string; player_id:string }>(`SELECT provider_player_id,player_id FROM player_provider_mappings
        WHERE provider='SPORTMONKS' AND provider_player_id=ANY($1::text[])`, [providerPlayerIds]),
      this.database.query<{ provider_entity_id:string; livasports_entity_id:string }>(`SELECT provider_entity_id,livasports_entity_id FROM provider_entity_mappings
        WHERE provider='SPORTMONKS' AND entity_type='TEAM'`, []),
    ]);
    const playerMap = new Map(players.rows.map(row => [row.provider_player_id,row.player_id]));
    const teamMap = new Map(teams.rows.map(row => [row.provider_entity_id,row.livasports_entity_id]));
    const rawPayload = rows.flatMap(row => {
      const playerId=playerMap.get(String(row.player_id)),teamId=teamMap.get(String(row.team_id));
      if(!playerId||!teamId)return [];
      return this.statisticPayload(row.details??[]).map(detail=>({...detail,player_id:playerId,team_id:teamId}));
    });
    const payload = [...new Map(rawPayload.map(row=>[`${row.player_id}:${row.provider_type_id}`,row])).values()];
    if (!payload.length) return emptyCounts();
    const persisted = await this.database.transaction(async db=>{
      await this.persistTypes(db,payload);
      return db.query<{ inserted:boolean }>(`WITH input AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(player_id uuid,team_id uuid,
        provider_statistic_id bigint,provider_type_id integer,value jsonb,provider_updated_at timestamptz))
        INSERT INTO fixture_player_statistics(fixture_id,player_id,team_id,provider_statistic_id,provider_type_id,value,provider_updated_at,observed_at)
        SELECT $2,player_id,team_id,provider_statistic_id,provider_type_id,value,provider_updated_at,now() FROM input
        ON CONFLICT(fixture_id,player_id,provider_type_id) DO UPDATE SET team_id=EXCLUDED.team_id,provider_statistic_id=EXCLUDED.provider_statistic_id,
          value=EXCLUDED.value,provider_updated_at=EXCLUDED.provider_updated_at,observed_at=now()
        RETURNING (xmax = 0) AS inserted`,[JSON.stringify(payload),target.fixtureId]);
    });
    const inserted = persisted.rows.filter(row => row.inserted).length;
    return {inserted,updated:persisted.rows.length-inserted};
  }

  async runSample() {
    const targets = await this.targets();
    const job = await this.startJob(targets.length);
    const counts = emptyCounts();
    const summaries: Array<{ role: string; team: string; teamState: string; squadRows: number;
      fixturePlayerStats: number; fixtureStatsState: string; fixtureStatsError?: string; error?: string }> = [];
    const samplePlayers: CanonicalPlayer[] = [];
    try {
      for (let index = 0; index < targets.length; index++) {
        const target = targets[index];
        try {
          const rawTeam = await this.provider.team(target.providerTeamId, target.providerSeasonId);
          if (!rawTeam) throw new Error('Team profile was not found within the subscription');
          addCounts(counts, await this.persistTeam(target, rawTeam));
          const rawSquad = await this.provider.squad(target.providerTeamId, target.providerSeasonId);
          const persisted = await this.persistSquad(target, rawSquad);
          addCounts(counts, persisted.counts);
          let fixturePlayerStats = 0;
          let fixtureStatsState = target.providerFixtureId ? 'NO_DATA_IN_SAMPLE' : 'NOT_APPLICABLE';
          let fixtureStatsError: string | undefined;
          if (target.providerFixtureId) {
            try {
              const persistedFixtureStats = await this.persistFixturePlayerStatistics(target,
                await this.provider.fixturePlayerStatistics(target.providerFixtureId));
              addCounts(counts, persistedFixtureStats);
              fixturePlayerStats = persistedFixtureStats.inserted + persistedFixtureStats.updated;
              fixtureStatsState = fixturePlayerStats ? 'AVAILABLE' : 'NO_DATA_IN_SAMPLE';
            } catch (error) {
              fixtureStatsState = 'ERROR';
              fixtureStatsError = sanitizeText(error instanceof Error ? error.message : 'Fixture player statistics failed', []);
            }
          }
          const selected = target.slug === 'brasileirao-serie-a' ? selectRepresentativePlayers(rawSquad, 4)
            : target.slug === 'liga-mx' ? selectRepresentativePlayers(rawSquad, 1) : [];
          for (const row of selected) {
            const found = persisted.players.find(item => item.providerPlayerId === String(row.player_id));
            if (found) samplePlayers.push(found);
          }
          summaries.push({ role: target.role, team: target.teamName, teamState: 'AVAILABLE', squadRows: rawSquad.length,
            fixturePlayerStats, fixtureStatsState, ...(fixtureStatsError ? { fixtureStatsError } : {}) });
        } catch (error) {
          const safe = sanitizeText(error instanceof Error ? error.message : 'Profile target failed', []);
          await Promise.all([
            this.state(this.database, 'TEAM', target.teamId, 'METADATA', 'ERROR', 0, safe),
            this.state(this.database, 'TEAM', target.teamId, 'SQUAD', 'ERROR', 0, safe),
          ]);
          summaries.push({ role: target.role, team: target.teamName, teamState: 'ERROR', squadRows: 0,
            fixturePlayerStats: 0, fixtureStatsState: 'NOT_EXECUTED', error: safe });
        }
        await this.heartbeat(job, index + 1, counts);
      }
      const playerSummaries: Array<{ publicId: string; state: string; error?: string }> = [];
      for (const player of samplePlayers) {
        try {
          const raw = await this.provider.player(player.providerPlayerId, targets.find(target => target.seasonId === player.seasonId)?.providerSeasonId ?? '');
          if (!raw) throw new Error('Player profile was not found within the subscription');
          addCounts(counts, await this.persistPlayer(player, raw));
          playerSummaries.push({ publicId: player.publicId, state: 'AVAILABLE' });
        } catch (error) {
          const safe = sanitizeText(error instanceof Error ? error.message : 'Player profile failed', []);
          await this.state(this.database, 'PLAYER', player.id, 'STATISTICS', 'ERROR', 0, safe);
          playerSummaries.push({ publicId: player.publicId, state: 'ERROR', error: safe });
        }
      }
      await this.linkFixturePlayers();
      await this.database.query(`UPDATE profile_sync_jobs SET status='SUCCEEDED',completed_at=now(),lease_expires_at=now(),provider_requests=$2,
        records_inserted=$3,records_updated=$4 WHERE id=$1`, [job.id, this.provider.requestCount(), counts.inserted, counts.updated]);
      return { jobId: job.id, targets: summaries, players: playerSummaries, providerRequests: this.provider.requestCount(), ...counts };
    } catch (error) {
      await this.database.query(`UPDATE profile_sync_jobs SET status='FAILED',completed_at=now(),lease_expires_at=now(),provider_requests=$2,
        records_inserted=$3,records_updated=$4,error_message=$5 WHERE id=$1`, [job.id, this.provider.requestCount(), counts.inserted, counts.updated,
        sanitizeText(error instanceof Error ? error.message : 'Profile sync failed', [])]);
      throw error;
    }
  }
}
