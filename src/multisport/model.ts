import { getSportsSource, isApprovedSourceForCompetition, isApprovedSourceUrl, OPENFOOTBALL_AUDITED_THROUGH } from './sources';
import catalog from './catalog-data.json';
import { WIKIMEDIA_DATASETS } from './wikimedia-datasets';

export const SPORT_IDS = ['football', 'basketball', 'baseball', 'american-football', 'ice-hockey', 'mma', 'tennis'] as const;
export type SportId = typeof SPORT_IDS[number];
export type SnapshotMode = 'automatic' | 'manual' | 'historical';
export type EntityKind = 'club' | 'national-team' | 'player' | 'fighter';
export interface SportsEntity { id: string; name: string; kind: EntityKind; country?: string }
export interface TableIdentity { id: string; name: string; stage: string; group?: string; conference?: string; division?: string }
export interface RankedRow { entityId: string; rank: number }
export interface FootballRow extends RankedRow {
  played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number;
  goalDifference: number; points: number; pointsAdjustment?: number;
}
export interface BasketballRow extends RankedRow {
  played: number; wins: number; losses: number; winPercentage: number; pointsFor?: number; pointsAgainst?: number; gamesBehind?: number;
}
export interface BaseballRow extends RankedRow {
  played: number; wins: number; losses: number; winPercentage: number; runsFor?: number; runsAgainst?: number; gamesBehind: number;
}
export interface AmericanFootballRow extends RankedRow {
  played: number; wins: number; losses: number; ties: number; winPercentage: number; pointsFor: number; pointsAgainst: number;
}
export interface IceHockeyRow extends RankedRow {
  played: number; wins: number; losses: number; overtimeLosses: number; points: number; goalsFor: number; goalsAgainst: number; regulationWins?: number;
}
export interface TennisRow extends RankedRow { points: number; tournamentsPlayed?: number; movement?: number }
/** Rank 0 is reserved for an explicitly identified champion; contenders start at 1. */
export interface MmaRow extends RankedRow { champion?: boolean; wins?: number; losses?: number; draws?: number; noContests?: number }
export interface FootballTable extends TableIdentity { type: 'football'; rows: FootballRow[] }
export interface BasketballTable extends TableIdentity { type: 'basketball'; rows: BasketballRow[] }
export interface BaseballTable extends TableIdentity { type: 'baseball'; rows: BaseballRow[] }
export interface AmericanFootballTable extends TableIdentity { type: 'american-football'; rows: AmericanFootballRow[] }
export interface IceHockeyTable extends TableIdentity { type: 'ice-hockey'; rows: IceHockeyRow[] }
export interface TennisTable extends TableIdentity {
  type: 'tennis'; rankingDate: string; tour: 'ATP' | 'WTA' | 'ITF'; discipline: 'singles' | 'doubles'; rankingSystem: 'ranking' | 'race'; rows: TennisRow[];
}
export type MmaTable = TableIdentity & { type: 'mma'; rankingDate: string; rankingSystem?: 'meta' | 'media'; rows: MmaRow[] } & (
  { rankingCategory: 'weight-class'; weightClass: string } | { rankingCategory: 'pound-for-pound'; weightClass?: never }
);
export type SportsTable = FootballTable | BasketballTable | BaseballTable | AmericanFootballTable | IceHockeyTable | TennisTable | MmaTable;
export interface PeriodScore { label: string; home: number; away: number }
/** Tennis totals are sets, with games per set in periods. MMA results may have null scores. */
export interface EventScore { home: number; away: number; periods?: PeriodScore[] }
export type EventStatus = 'scheduled' | 'live' | 'completed' | 'postponed' | 'cancelled';
export interface SportsEvent {
  id: string; stage: string; round?: string; group?: string; homeId: string; awayId: string;
  start: string | null; date?: string; status: EventStatus; scores: EventScore | null;
  outcome?: 'home-win' | 'away-win' | 'draw' | 'no-contest'; method?: string;
}
/** Official draw seeds are separate facts: never derive these from ranking rows. */
export interface TournamentSeed { entityId: string; seed: number; draw: string; announcedAt: string }
export interface SourceRevision { title: string; revisionId: number; revisionTimestamp: string; dataAsOf?: string }
export interface SportsSnapshot {
  schemaVersion: 1; competitionId: string; sport: SportId; season: string; stage: string;
  /** Calendar-only source dates remain dates; revision timestamps are NOT result cutoffs. */
  sourceId: string; sourceUrl: string; observedAt: string; retrievedAt: string; mode: SnapshotMode;
  observationBasis?: 'data-date' | 'source-revision'; provenance?: SourceRevision[];
  entities: SportsEntity[]; tables: SportsTable[]; events: SportsEvent[]; seeds?: TournamentSeed[];
}

export const SNAPSHOT_LIMITS = Object.freeze({ entities: 2048, tables: 100, rowsPerTable: 2048, totalRows: 10000, events: 5000, seeds: 512, errors: 100 });
type RecordValue = Record<string, unknown>;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const placeholderPattern = /^(?:tbd|tba|unknown|placeholder|to be (?:decided|determined|announced)|winner of\b|loser of\b)/i;
const tableKeys = ['type', 'id', 'name', 'stage', 'group', 'conference', 'division', 'rows'];
const rowFields: Record<SportId, readonly string[]> = {
  football: ['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'goalDifference', 'points', 'pointsAdjustment'],
  basketball: ['played', 'wins', 'losses', 'winPercentage', 'pointsFor', 'pointsAgainst', 'gamesBehind'],
  baseball: ['played', 'wins', 'losses', 'winPercentage', 'runsFor', 'runsAgainst', 'gamesBehind'],
  'american-football': ['played', 'wins', 'losses', 'ties', 'winPercentage', 'pointsFor', 'pointsAgainst'],
  'ice-hockey': ['played', 'wins', 'losses', 'overtimeLosses', 'points', 'goalsFor', 'goalsAgainst', 'regulationWins'],
  tennis: ['points', 'tournamentsPlayed', 'movement'], mma: ['champion', 'wins', 'losses', 'draws', 'noContests'],
};
const optionalRowFields = new Set(['pointsAdjustment', 'regulationWins', 'tournamentsPlayed', 'movement', 'champion', 'runsFor', 'runsAgainst']);

/** Accept unambiguous UTC ISO timestamps, rejecting rollover dates such as February 30. */
function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 19) !== value.slice(0, 19)) return null;
  return parsed;
}
function dateOnly(value: unknown): number | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? timestamp(`${value}T00:00:00Z`) : null;
}
function clockValue(now: Date | number): number { return now instanceof Date ? now.getTime() : now; }

/** Bound traversal before accessing properties; reject accessors, cycles and non-JSON objects. */
function structuralError(value: unknown): string | null {
  let nodes = 0, characters = 0;
  const seen = new WeakSet<object>();
  const inspect = (item: unknown, depth: number): string | null => {
    if (++nodes > 250000 || depth > 12) return 'snapshot exceeds structural limits';
    if (item === null || typeof item === 'boolean') return null;
    if (typeof item === 'number') return Number.isFinite(item) ? null : 'snapshot contains a non-finite number';
    if (typeof item === 'string') { characters += item.length; return item.length > 2048 || characters > 2000000 ? 'snapshot exceeds text limits' : null; }
    if (typeof item !== 'object') return 'snapshot contains a non-JSON value';
    if (seen.has(item)) return 'snapshot contains a cycle or shared object';
    seen.add(item);
    if (Array.isArray(item)) {
      if (item.length > SNAPSHOT_LIMITS.events) return 'snapshot array exceeds limits';
      const keys = Reflect.ownKeys(item);
      if (keys.length !== item.length + 1) return 'snapshot contains a sparse or extended array';
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !('value' in descriptor)) return 'snapshot contains an array accessor';
        const error = inspect(descriptor.value, depth + 1); if (error) return error;
      }
      return null;
    }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) return 'snapshot contains a non-plain object';
    const keys = Reflect.ownKeys(item);
    if (keys.length > 32) return 'snapshot object exceeds field limits';
    for (const key of keys) {
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) return 'snapshot contains an unsafe key';
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return 'snapshot contains an accessor or hidden field';
      const error = inspect(descriptor.value, depth + 1); if (error) return error;
    }
    return null;
  };
  return inspect(value, 0);
}

/** Validate untrusted snapshots before storage AND before publication. Empty errors means accepted. */
export function validateSnapshot(value: unknown, now: Date | number = Date.now()): string[] {
  const errors: string[] = [];
  const add = (path: string, message: string) => { if (errors.length < SNAPSHOT_LIMITS.errors) errors.push(`${path}: ${message}`); };
  try {
    const structure = structuralError(value); if (structure) return [structure];
    const clock = clockValue(now); if (!Number.isFinite(clock)) return ['now: invalid clock'];
    const object = (item: unknown, path: string, allowed: readonly string[], required: readonly string[] = allowed): RecordValue | null => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) { add(path, 'expected object'); return null; }
      const row = item as RecordValue;
      for (const key of Object.keys(row)) if (!allowed.includes(key)) add(`${path}.${key}`, 'unknown field');
      for (const key of required) if (!Object.hasOwn(row, key)) add(`${path}.${key}`, 'required');
      return row;
    };
    const text = (item: unknown, path: string, max = 160): item is string => {
      const valid = typeof item === 'string' && item.length > 0 && item.length <= max && item.trim() === item && !/[\u0000-\u001f\u007f]/.test(item);
      if (!valid) add(path, `expected nonempty text, at most ${max} characters`); return valid;
    };
    const identifier = (item: unknown, path: string): item is string => {
      const valid = typeof item === 'string' && idPattern.test(item); if (!valid) add(path, 'invalid identifier'); return valid;
    };
    const number = (item: unknown, path: string, min = 0, max = 100000, integer = true): item is number => {
      const valid = typeof item === 'number' && Number.isFinite(item) && item >= min && item <= max && (!integer || Number.isInteger(item));
      if (!valid) add(path, `expected ${integer ? 'integer' : 'number'} in [${min}, ${max}]`); return valid;
    };
    const enumeration = (item: unknown, values: readonly string[], path: string) => {
      if (typeof item !== 'string' || !values.includes(item)) { add(path, 'unsupported value'); return false; } return true;
    };
    const list = (item: unknown, path: string, max: number, min = 0): unknown[] => {
      if (!Array.isArray(item) || item.length < min || item.length > max) { add(path, `expected array with ${min}–${max} entries`); return []; } return item;
    };
    const iso = (item: unknown, path: string): number | null => {
      const result = timestamp(item); if (result === null) add(path, 'expected valid UTC ISO timestamp'); return result;
    };
    const snap = object(value, 'snapshot', ['schemaVersion', 'competitionId', 'sport', 'season', 'stage', 'sourceId', 'sourceUrl', 'observedAt', 'retrievedAt', 'mode', 'entities', 'tables', 'events', 'seeds', 'observationBasis', 'provenance'], ['schemaVersion', 'competitionId', 'sport', 'season', 'stage', 'sourceId', 'sourceUrl', 'observedAt', 'retrievedAt', 'mode', 'entities', 'tables', 'events']);
    if (!snap) return errors;
    if (snap.schemaVersion !== 1) add('schemaVersion', 'only version 1 is supported');
    identifier(snap.competitionId, 'competitionId'); identifier(snap.sourceId, 'sourceId');
    text(snap.season, 'season', 32); text(snap.stage, 'stage');
    enumeration(snap.sport, SPORT_IDS, 'sport'); enumeration(snap.mode, ['automatic', 'manual', 'historical'], 'mode');
    const competition = catalog.find(item => item.id === snap.competitionId);
    if (!competition) add('competitionId', 'competition is not in the approved catalog');
    else if (competition.sport !== snap.sport) add('sport', 'sport does not match the catalog competition');
    if (competition?.coverageStatus === 'HISTORICAL' && snap.mode !== 'historical') add('mode', 'an archival catalog edition requires historical mode');
    const observedIsDay = (snap.mode === 'historical' || (snap.sourceId === 'wikimedia' && snap.observationBasis === 'data-date')) && dateOnly(snap.observedAt) !== null;
    const observed = observedIsDay ? dateOnly(snap.observedAt) : iso(snap.observedAt, 'observedAt'), retrieved = iso(snap.retrievedAt, 'retrievedAt');
    if (observed !== null && retrieved !== null && observed > retrieved) add('observedAt', 'source observation cannot follow retrieval');
    if (observed !== null && observed > clock) add('observedAt', 'source observation is in the future');
    if (retrieved !== null && retrieved > clock + 300000) add('retrievedAt', 'retrieval is in the future');
    const source = typeof snap.sourceId === 'string' ? getSportsSource(snap.sourceId) : undefined;
    if (source?.status !== 'approved') add('sourceId', 'source has no approved factual-data licence; manual mode does not bypass this');
    else if (!source.sports.includes(snap.sport as SportId)) add('sourceId', 'source is not approved for this sport');
    else if (!isApprovedSourceForCompetition(source.id, String(snap.competitionId), String(snap.sport), String(snap.sourceUrl), String(snap.season))) add('sourceId', 'source dataset is not approved for this competition and season');
    if (!text(snap.sourceUrl, 'sourceUrl', 2048) || !isApprovedSourceUrl(String(snap.sourceId), String(snap.sourceUrl))) add('sourceUrl', 'URL does not match an approved source');
    if (snap.sourceId === 'wikimedia') {
      const dataset = WIKIMEDIA_DATASETS.find(item => item.competitionId === snap.competitionId && item.season === snap.season);
      if (snap.mode === 'automatic') add('mode', 'Wikimedia imports require editorial review; automatic publication is not approved');
      if (Array.isArray(snap.events) && snap.events.length) add('events', 'these reviewed Wikimedia datasets cover tables only, not fixtures or results');
      if (Array.isArray(snap.seeds) && snap.seeds.length) add('seeds', 'these reviewed Wikimedia datasets do not cover tournament seeds');
      if (dataset?.historical && snap.mode !== 'historical') add('mode', 'this dataset is a historical edition');
      enumeration(snap.observationBasis, ['data-date', 'source-revision'], 'observationBasis');
      const titles = new Set<string>(), dates: string[] = [], revisions: string[] = [];
      const provenance = list(snap.provenance, 'provenance', 16, 1);
      for (const [index, value] of provenance.entries()) {
        const path = `provenance[${index}]`;
        const item = object(value, path, ['title', 'revisionId', 'revisionTimestamp', 'dataAsOf'], ['title', 'revisionId', 'revisionTimestamp']);
        if (!item) continue;
        if (text(item.title, `${path}.title`, 250)) {
          if (titles.has(item.title)) add(`${path}.title`, 'duplicate source page');
          titles.add(item.title);
          if (!dataset?.titles.includes(item.title)) add(`${path}.title`, 'page is not in the reviewed dataset');
        }
        number(item.revisionId, `${path}.revisionId`, 1, Number.MAX_SAFE_INTEGER);
        const revision = iso(item.revisionTimestamp, `${path}.revisionTimestamp`);
        if (revision !== null) {
          revisions.push(String(item.revisionTimestamp));
          if (retrieved !== null && revision > retrieved) add(`${path}.revisionTimestamp`, 'revision cannot postdate retrieval');
          if (revision > clock) add(`${path}.revisionTimestamp`, 'revision is in the future');
        }
        if (item.dataAsOf !== undefined) {
          const day = dateOnly(item.dataAsOf);
          if (day === null) add(`${path}.dataAsOf`, 'expected valid source calendar date');
          else {
            dates.push(String(item.dataAsOf));
            if (revision !== null && day > revision) add(`${path}.dataAsOf`, 'data date cannot postdate its source revision');
          }
        } else if (snap.observationBasis === 'data-date') add(`${path}.dataAsOf`, 'explicit source data date required');
      }
      if (dataset && (titles.size !== dataset.titles.length || dataset.titles.some(title => !titles.has(title)))) add('provenance', 'every contributing source page is required');
      const expected = snap.observationBasis === 'data-date' ? dates.sort()[0] : revisions.sort()[0];
      if (!expected || snap.observedAt !== expected) add('observedAt', 'must equal the oldest contributing source data date or revision');
    } else if (snap.provenance !== undefined || snap.observationBasis !== undefined) add('provenance', 'revision provenance is only approved for Wikimedia datasets');
    const historicalResultsOnly = source?.snapshotPolicy === 'historical-results-only';
    const auditedThrough = historicalResultsOnly ? OPENFOOTBALL_AUDITED_THROUGH[String(snap.competitionId)] : undefined;
    if (historicalResultsOnly) {
      if (snap.mode !== 'historical') add('mode', 'this source is approved only for historical results');
      if (Array.isArray(snap.tables) && snap.tables.length) add('tables', 'this source has no approved standings or rankings coverage');
      if (auditedThrough && typeof snap.observedAt === 'string' && snap.observedAt.slice(0, 10) > auditedThrough) add('observedAt', `source coverage is verified only through ${auditedThrough}`);
    }

    const entities = new Map<string, RecordValue>();
    list(snap.entities, 'entities', SNAPSHOT_LIMITS.entities, 1).forEach((item, index) => {
      const path = `entities[${index}]`, entity = object(item, path, ['id', 'name', 'kind', 'country'], ['id', 'name', 'kind']); if (!entity) return;
      if (identifier(entity.id, `${path}.id`)) {
        if (entities.has(entity.id)) add(`${path}.id`, 'duplicate entity'); else entities.set(entity.id, entity);
      }
      if (text(entity.name, `${path}.name`) && placeholderPattern.test(entity.name)) add(`${path}.name`, 'placeholder participants are not accepted');
      enumeration(entity.kind, ['club', 'national-team', 'player', 'fighter'], `${path}.kind`);
      if (entity.country !== undefined) text(entity.country, `${path}.country`, 80);
      const allowedKinds = snap.sport === 'mma' ? ['fighter'] : snap.sport === 'tennis' ? ['player', 'national-team'] : ['club', 'national-team'];
      if (!allowedKinds.includes(String(entity.kind))) add(`${path}.kind`, 'entity kind does not match sport');
    });
    const reference = (id: unknown, path: string) => { if (identifier(id, path) && !entities.has(id)) add(path, 'unknown entity reference'); };
    const tableIds = new Set<string>(); let totalRows = 0;
    list(snap.tables, 'tables', SNAPSHOT_LIMITS.tables).forEach((item, index) => {
      const path = `tables[${index}]`;
      const rawType = item && typeof item === 'object' ? (item as RecordValue).type : undefined;
      const extra = rawType === 'tennis' ? ['rankingDate', 'tour', 'discipline', 'rankingSystem'] : rawType === 'mma' ? ['rankingDate', 'rankingCategory', 'weightClass', 'rankingSystem'] : [];
      const table = object(item, path, [...tableKeys, ...extra], ['type', 'id', 'name', 'stage', 'rows', ...extra.filter(key => key !== 'weightClass' && !(rawType === 'mma' && key === 'rankingSystem'))]); if (!table) return;
      if (identifier(table.id, `${path}.id`)) { if (tableIds.has(table.id)) add(`${path}.id`, 'duplicate table'); tableIds.add(table.id); }
      for (const field of ['name', 'stage', 'group', 'conference', 'division']) if (table[field] !== undefined) text(table[field], `${path}.${field}`);
      if (!enumeration(table.type, SPORT_IDS, `${path}.type`)) return;
      const sport = table.type as SportId;
      if (sport !== snap.sport) add(`${path}.type`, 'table sport does not match snapshot');
      if (sport === 'tennis' || sport === 'mma') {
        const date = dateOnly(table.rankingDate);
        if (date === null) add(`${path}.rankingDate`, 'expected calendar date YYYY-MM-DD');
        else if (observed !== null && date > observed) add(`${path}.rankingDate`, 'rankings cannot postdate source observation');
      }
      if (sport === 'tennis') {
        enumeration(table.tour, ['ATP', 'WTA', 'ITF'], `${path}.tour`);
        enumeration(table.discipline, ['singles', 'doubles'], `${path}.discipline`);
        enumeration(table.rankingSystem, ['ranking', 'race'], `${path}.rankingSystem`);
        if (snap.sourceId === 'wikimedia' && ['atp-rankings', 'wta-rankings'].includes(String(snap.competitionId))) {
          const approvedTour = snap.competitionId === 'atp-rankings' ? 'ATP' : 'WTA';
          if (table.tour !== approvedTour || table.discipline !== 'singles' || table.rankingSystem !== 'ranking') add(path, `this dataset covers only the reviewed singles ranking for ${approvedTour}, not another tour, doubles or race`);
        }
      }
      if (sport === 'mma') {
        if (snap.sourceId === 'wikimedia' && snap.competitionId === 'ufc' && (table.rankingSystem !== 'meta' || table.rankingCategory !== 'weight-class')) add(path, 'this dataset covers only reviewed Meta weight-class rankings, not media or pound-for-pound rankings');
        if (table.rankingSystem !== undefined) enumeration(table.rankingSystem, ['meta', 'media'], `${path}.rankingSystem`);
        enumeration(table.rankingCategory, ['weight-class', 'pound-for-pound'], `${path}.rankingCategory`);
        if (table.rankingCategory === 'weight-class') {
          if (text(table.weightClass, `${path}.weightClass`, 80) && (placeholderPattern.test(table.weightClass) || /pound[\s-]*(?:for[\s-]*)?pound|p4p/i.test(table.weightClass))) add(`${path}.weightClass`, 'requires an actual weight class, not a pound-for-pound ranking');
        } else if (table.weightClass !== undefined) add(`${path}.weightClass`, 'pound-for-pound rankings do not have a weight class');
      }
      const rows = list(table.rows, `${path}.rows`, SNAPSHOT_LIMITS.rowsPerTable, 1); totalRows += rows.length;
      if (totalRows > SNAPSHOT_LIMITS.totalRows) { add('tables', 'total row limit exceeded'); return; }
      const rowIds = new Set<string>(); const ranks = new Set<number>();
      rows.forEach((rowValue, rowIndex) => {
        const rowPath = `${path}.rows[${rowIndex}]`, fields = rowFields[sport];
        const required = fields.filter(field => !optionalRowFields.has(field) && !(sport === 'basketball' && ['gamesBehind','pointsFor','pointsAgainst'].includes(field)) && sport !== 'mma');
        const row = object(rowValue, rowPath, ['entityId', 'rank', ...fields], ['entityId', 'rank', ...required]); if (!row) return;
        reference(row.entityId, `${rowPath}.entityId`);
        if (typeof row.entityId === 'string') { if (rowIds.has(row.entityId)) add(`${rowPath}.entityId`, 'duplicate table participant'); rowIds.add(row.entityId); }
        if (number(row.rank, `${rowPath}.rank`, sport === 'mma' && row.champion === true ? 0 : 1, 10000)) {
          if (ranks.has(row.rank)) add(`${rowPath}.rank`, 'duplicate rank'); ranks.add(row.rank);
        }
        if (sport === 'mma' && row.champion === true && row.rank !== 0) add(`${rowPath}.rank`, 'champion uses rank 0, separate from ranked contenders');
        if (sport === 'mma' && table.rankingCategory === 'pound-for-pound' && row.champion === true) add(`${rowPath}.champion`, 'pound-for-pound ranking is not a championship division');
        for (const field of fields) {
          if (row[field] === undefined) continue;
          if (field === 'champion') { if (typeof row[field] !== 'boolean') add(`${rowPath}.${field}`, 'expected boolean'); }
          else if (field === 'winPercentage') number(row[field], `${rowPath}.${field}`, 0, 1, false);
          else if (field === 'movement') number(row[field], `${rowPath}.${field}`, -10000, 10000);
          else if (field === 'gamesBehind') { if (number(row[field], `${rowPath}.${field}`, 0, 1000, false) && (row[field] as number) * 2 % 1 !== 0) add(`${rowPath}.${field}`, 'expected a half-game increment'); }
          else number(row[field], `${rowPath}.${field}`, ['goalDifference', 'pointsAdjustment', 'points'].includes(field) && sport === 'football' ? -100000 : 0);
        }
        const n = (key: string): number => typeof row[key] === 'number' ? row[key] as number : NaN;
        const equal = (field: string, expected: number) => { if (Number.isFinite(n(field)) && Number.isFinite(expected) && n(field) !== expected) add(`${rowPath}.${field}`, 'inconsistent arithmetic'); };
        if (sport === 'football') {
          equal('played', n('won') + n('drawn') + n('lost')); equal('goalDifference', n('goalsFor') - n('goalsAgainst'));
          equal('points', n('won') * 3 + n('drawn') + (row.pointsAdjustment === undefined ? 0 : n('pointsAdjustment')));
        }
        if (['basketball', 'baseball', 'american-football', 'ice-hockey'].includes(sport)) {
          equal('played', n('wins') + n('losses') + (sport === 'american-football' ? n('ties') : sport === 'ice-hockey' ? n('overtimeLosses') : 0));
          if (sport === 'ice-hockey') {
            equal('points', n('wins') * 2 + n('overtimeLosses'));
            if (row.regulationWins !== undefined && n('regulationWins') > n('wins')) add(`${rowPath}.regulationWins`, 'cannot exceed wins');
          } else {
            const expected = n('played') === 0 ? 0 : (n('wins') + (sport === 'american-football' ? n('ties') / 2 : 0)) / n('played');
            if (Number.isFinite(expected) && Number.isFinite(n('winPercentage')) && Math.abs(expected - n('winPercentage')) > 0.00051) add(`${rowPath}.winPercentage`, 'inconsistent win percentage (use 0–1, not 0–100)');
          }
        }
        if (sport === 'tennis' && entities.get(String(row.entityId))?.kind !== 'player') add(`${rowPath}.entityId`, 'individual rankings require a player');
      });
    });

    const eventIds = new Set<string>(); const eventKeys = new Set<string>();
    list(snap.events, 'events', SNAPSHOT_LIMITS.events).forEach((item, index) => {
      const path = `events[${index}]`, event = object(item, path, ['id', 'stage', 'round', 'group', 'homeId', 'awayId', 'start', 'date', 'status', 'scores', 'outcome', 'method'], ['id', 'stage', 'homeId', 'awayId', 'start', 'status', 'scores']); if (!event) return;
      if (identifier(event.id, `${path}.id`)) { if (eventIds.has(event.id)) add(`${path}.id`, 'duplicate event'); eventIds.add(event.id); }
      for (const field of ['stage', 'round', 'group', 'method']) if (event[field] !== undefined) text(event[field], `${path}.${field}`);
      reference(event.homeId, `${path}.homeId`); reference(event.awayId, `${path}.awayId`);
      if (event.homeId === event.awayId) add(path, 'participants must be different');
      const eventKey = JSON.stringify([event.homeId, event.awayId, event.start, event.date, event.stage, event.round, event.group]);
      if (eventKeys.has(eventKey)) add(path, 'duplicate fixture identity'); eventKeys.add(eventKey);
      enumeration(event.status, ['scheduled', 'live', 'completed', 'postponed', 'cancelled'], `${path}.status`);
      if (historicalResultsOnly && event.status !== 'completed') add(`${path}.status`, 'this source is approved only for completed historical results');
      const start = event.start === null ? null : iso(event.start, `${path}.start`);
      const day = event.date === undefined ? null : dateOnly(event.date);
      if (event.date !== undefined && day === null) add(`${path}.date`, 'expected valid calendar date YYYY-MM-DD');
      if (start !== null && event.date !== undefined && String(event.start).slice(0, 10) !== event.date) add(`${path}.date`, 'calendar date contradicts the UTC start date');
      const sourceDay = start !== null ? String(event.start).slice(0, 10) : typeof event.date === 'string' ? event.date : null;
      if (auditedThrough && sourceDay !== null && sourceDay > auditedThrough) add(`${path}.date`, `result exceeds the source audit cutoff ${auditedThrough}`);
      const eventObservationDate = observedIsDay && start !== null ? dateOnly(String(event.start).slice(0, 10)) : start ?? day;
      if (['live', 'completed'].includes(String(event.status)) && (eventObservationDate === null || (observed !== null && eventObservationDate > observed))) add(`${path}.start`, 'started/completed events need a start or source calendar date no later than the source observation');
      if (event.outcome !== undefined) enumeration(event.outcome, ['home-win', 'away-win', 'draw', 'no-contest'], `${path}.outcome`);
      if (event.status !== 'completed' && event.outcome !== undefined) add(`${path}.outcome`, 'outcome requires a completed event');
      if (['scheduled', 'cancelled'].includes(String(event.status)) && event.scores !== null) add(`${path}.scores`, 'unplayed events must not have scores');
      if (event.status === 'completed' && snap.sport !== 'mma' && event.scores === null) add(`${path}.scores`, 'completed events require scores');
      if (event.status === 'completed' && snap.sport === 'mma' && event.outcome === undefined) add(`${path}.outcome`, 'completed bouts require a result');
      if (event.method !== undefined && snap.sport !== 'mma') add(`${path}.method`, 'bout method is only valid for MMA');
      if (event.scores !== null) {
        const scores = object(event.scores, `${path}.scores`, ['home', 'away', 'periods'], ['home', 'away']);
        if (scores) {
          const max = snap.sport === 'tennis' ? 3 : 1000;
          const validHome = number(scores.home, `${path}.scores.home`, 0, max), validAway = number(scores.away, `${path}.scores.away`, 0, max);
          if (validHome && validAway && event.outcome !== undefined && event.outcome !== 'no-contest') {
            const derived = scores.home === scores.away ? 'draw' : (scores.home as number) > (scores.away as number) ? 'home-win' : 'away-win';
            if (event.outcome !== derived) add(`${path}.outcome`, 'outcome contradicts scores');
          }
          if (scores.periods !== undefined) {
            const labels = new Set<string>();
            const periods = list(scores.periods, `${path}.scores.periods`, snap.sport === 'tennis' ? 5 : 50, 1);
            let homeSum = 0, awaySum = 0, periodScoresValid = true;
            periods.forEach((periodValue, periodIndex) => {
              const pp = `${path}.scores.periods[${periodIndex}]`, period = object(periodValue, pp, ['label', 'home', 'away']); if (!period) return;
              if (text(period.label, `${pp}.label`, 40)) { if (labels.has(period.label)) add(`${pp}.label`, 'duplicate period'); labels.add(period.label); }
              const homeValid = number(period.home, `${pp}.home`, 0, 1000), awayValid = number(period.away, `${pp}.away`, 0, 1000);
              if (!homeValid || !awayValid) { periodScoresValid = false; return; }
              if (snap.sport === 'tennis') {
                if (event.status === 'completed' && period.home === period.away) add(pp, 'a completed set cannot be tied');
                if ((period.home as number) > (period.away as number)) homeSum++; else if ((period.away as number) > (period.home as number)) awaySum++;
              } else { homeSum += period.home as number; awaySum += period.away as number; }
            });
            // Periods describe disjoint scoring segments, not cumulative checkpoints.
            if (periodScoresValid && validHome && validAway && event.status === 'completed' && (homeSum !== scores.home || awaySum !== scores.away)) add(`${path}.scores.periods`, 'period totals do not match the final score');
          }
        }
      }
    });
    if (snap.seeds !== undefined) {
      if (snap.sport !== 'tennis') add('seeds', 'tournament seeds are only supported for tennis');
      const seedNumbers = new Set<string>(), seedEntities = new Set<string>();
      list(snap.seeds, 'seeds', SNAPSHOT_LIMITS.seeds).forEach((item, index) => {
        const path = `seeds[${index}]`, seed = object(item, path, ['entityId', 'seed', 'draw', 'announcedAt']); if (!seed) return;
        reference(seed.entityId, `${path}.entityId`); number(seed.seed, `${path}.seed`, 1, 256); text(seed.draw, `${path}.draw`);
        const announced = iso(seed.announcedAt, `${path}.announcedAt`);
        if (announced !== null && observed !== null && (observedIsDay ? dateOnly(String(seed.announcedAt).slice(0, 10))! : announced) > observed) add(`${path}.announcedAt`, 'seed announcement cannot postdate observation');
        const key = JSON.stringify([seed.draw, seed.seed]), entityKey = JSON.stringify([seed.draw, seed.entityId]);
        if (seedNumbers.has(key) || seedEntities.has(entityKey)) add(path, 'duplicate seed or participant within draw');
        seedNumbers.add(key); seedEntities.add(entityKey);
      });
    }
    if (Array.isArray(snap.tables) && Array.isArray(snap.events) && !snap.tables.length && !snap.events.length) add('snapshot', 'requires a table or event; entity-only metadata is not a sports snapshot');
    return errors;
  } catch { return ['snapshot: unsafe or unreadable input']; }
}

export interface SnapshotFreshness { status: 'fresh' | 'stale' | 'historical' | 'unconfirmed' | 'invalid'; ageHours: number | null; observedAt: string }
/** Retrieval success never refreshes the source age. Call after validateSnapshot at trust boundaries. */
export function snapshotFreshness(snapshot: Pick<SportsSnapshot, 'observedAt' | 'mode' | 'observationBasis'>, now: Date | number = Date.now(), maxAgeHours = 24): SnapshotFreshness {
  const day = snapshot.mode === 'historical' || snapshot.observationBasis === 'data-date' ? dateOnly(snapshot.observedAt) : null;
  const observed = day ?? timestamp(snapshot.observedAt), clock = clockValue(now);
  if (observed === null || !Number.isFinite(clock) || observed > clock || !Number.isFinite(maxAgeHours) || maxAgeHours <= 0 || maxAgeHours > 87600) return { status: 'invalid', ageHours: null, observedAt: snapshot.observedAt };
  // A source calendar day has no known timezone/time. Use the oldest possible
  // instant (UTC+14 start of day) for age, but preserve the original date label.
  const ageHours = (clock - observed) / 3600000 + (day === null ? 0 : 14);
  return { status: snapshot.mode === 'historical' ? 'historical' : snapshot.observationBasis === 'source-revision' ? 'unconfirmed' : ageHours > maxAgeHours ? 'stale' : 'fresh', ageHours, observedAt: snapshot.observedAt };
}
