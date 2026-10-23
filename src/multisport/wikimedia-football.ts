import { createHash } from 'node:crypto';
import { validateSnapshot, type SportsEntity, type SportsSnapshot, type FootballRow, type AmericanFootballRow, type BaseballRow } from './model';
import { fetchWikimediaDataset, WIKIMEDIA_LICENSE_URL, type WikimediaBatch, type WikimediaFetchOptions } from './wikimedia';

export interface WikimediaPreview {
  snapshot: SportsSnapshot;
  summary: { competitionId: string; entities: number; tables: number; rows: number; events: 0; observedAt: string; observationBasis: 'data-date' | 'source-revision'; sourceSha256: string | null; licenseUrl: string; warning: string };
}
const invalid = (code: string): never => { throw new Error(`WIKIMEDIA_${code}`); };
const count = (value: string, max = 10000): number => /^\d+$/.test(value.trim()) && Number(value) <= max ? Number(value) : invalid('INVALID_NUMBER');
const entityId = (competition: string, name: string) => `wikimedia-${createHash('sha256').update(`${competition}:${name}`).digest('hex').slice(0, 24)}`;
const withoutComments = (text: string) => text.replace(/<!--[\s\S]*?-->/g, '');
function name(value: string): string {
  const match = /^\[\[([^\]\n]+)\]\]$/.exec(value.trim());
  const result = match ? match[1].split('|').at(-1)! : value.trim();
  if (!result || result.length > 160 || /[<>{}\[\]\u0000-\u001f]/.test(result)) return invalid('INVALID_ENTITY');
  return result;
}
function field(text: string, key: string): string {
  const matches = [...text.matchAll(new RegExp(`\\|\\s*${key}\\s*=\\s*(\\[\\[[^\\n]*?\\]\\]|[^|\\n]*)`, 'g'))];
  if (matches.length !== 1) return invalid('MISSING_OR_DUPLICATE_FIELD');
  return matches[0][1].trim();
}
function dateLabel(value: string): string {
  const parsed = /^(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/.exec(value);
  if (!parsed) return invalid('DATA_DATE');
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const day = `${parsed[3]}-${String(months.indexOf(parsed[2]) + 1).padStart(2, '0')}-${parsed[1].padStart(2, '0')}`;
  if (!Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) return invalid('DATA_DATE');
  return day;
}

/** Numeric factual rows only. No article prose, crests, image URLs or copied presentation. */
export function normalizeWikimediaSports(batch: WikimediaBatch, now = new Date()): WikimediaPreview {
  const { dataset, pages } = batch;
  if (!['liga-mx', 'colombia-primera-a', 'nfl', 'mlb'].includes(dataset.competitionId)) return invalid('ADAPTER_NOT_APPROVED');
  if (pages.length !== dataset.titles.length || pages.some((page, index) => page.title !== dataset.titles[index])) return invalid('INCOMPLETE_PAGES');
  const entities: SportsEntity[] = [], ids = new Set<string>();
  const participant = (value: string, country?: string) => {
    const displayName = name(value), id = entityId(dataset.competitionId, displayName);
    if (ids.has(id)) return invalid('DUPLICATE_ENTITY'); ids.add(id);
    entities.push({ id, name: displayName, kind: 'club', ...(country ? { country } : {}) });
    return id;
  };
  const provenance = pages.map(page => ({ title: page.title, revisionId: page.revisionId, revisionTimestamp: page.revisionTimestamp }));
  let observedAt = [...provenance].sort((a, b) => a.revisionTimestamp.localeCompare(b.revisionTimestamp))[0].revisionTimestamp;
  let observationBasis: 'data-date' | 'source-revision' = 'source-revision';
  const tables: SportsSnapshot['tables'] = [];
  if (dataset.competitionId === 'liga-mx' || dataset.competitionId === 'colombia-primera-a') {
    const colombia=dataset.competitionId==='colombia-primera-a',expectedTeams=colombia?20:18,maxPlayed=expectedTeams-1;
    let text = withoutComments(pages[0].wikitext);
    if(colombia){
      const blocks=[...text.matchAll(/<section begin="Finalización"\s*\/>\s*([\s\S]*?)<section end="Finalización"\s*\/>/g)];
      if(blocks.length!==1)return invalid('UNREVIEWED_FORMAT');text=blocks[0][1];
      if(field(text,'section')!=='Finalización')return invalid('UNREVIEWED_FORMAT');
    }
    if (!text.includes('{{#invoke:Sports table|main|style=WDL') || /\|\s*(?:adjust_points|points_adjustment|deduct_points|winpoints|drawpoints)(?:_[A-Z]+)?\s*=/i.test(text)) return invalid('UNREVIEWED_FORMAT');
    observedAt = dateLabel(field(text, 'update')); observationBasis = 'data-date';
    if (observedAt > pages[0].revisionTimestamp.slice(0, 10)) return invalid('DATA_DATE');
    const order = field(text, 'team_order').split(',').map(code => code.trim());
    if (order.length !== expectedTeams || new Set(order).size !== expectedTeams || order.some(code => !/^[A-Z]{2,4}$/.test(code))) return invalid('PARTIAL_TABLE');
    const present = [...text.matchAll(/\|\s*win_([A-Z]{2,4})\s*=/g)].map(match => match[1]);
    if (present.length !== expectedTeams || present.some(code => !order.includes(code))) return invalid('PARTIAL_TABLE');
    const rows: FootballRow[] = order.map((code, index) => {
      const won = count(field(text, `win_${code}`), maxPlayed), drawn = count(field(text, `draw_${code}`), maxPlayed), lost = count(field(text, `loss_${code}`), maxPlayed);
      const goalsFor = count(field(text, `gf_${code}`), 200), goalsAgainst = count(field(text, `ga_${code}`), 200);
      if (won + drawn + lost > maxPlayed) return invalid('INVALID_PLAYED');
      return { entityId: participant(field(text, `name_${code}`), colombia?'Colombia':'Mexico'), rank: index + 1, played: won + drawn + lost, won, drawn, lost, goalsFor, goalsAgainst, goalDifference: goalsFor - goalsAgainst, points: 3 * won + drawn };
    });
    if (rows.reduce((sum, row) => sum + row.won - row.lost, 0) || rows.reduce((sum, row) => sum + row.goalsFor - row.goalsAgainst, 0) || rows.reduce((sum, row) => sum + row.drawn, 0) % 2 || rows.some((row, index) => index > 0 && row.points > rows[index - 1].points)) return invalid('INCONSISTENT_TABLE');
    tables.push({ type: 'football', id: colombia?'finalizacion':'apertura', name: colombia?'Finalización — community-maintained standings':'Apertura — community-maintained standings', stage: colombia?'Torneo Finalización':'Torneo Apertura', rows });
  } else if (dataset.competitionId === 'nfl') {
    for (const page of pages) {
      const division = /^Template:2026 (AFC|NFC) (East|North|South|West) standings$/.exec(page.title);
      if (!division) return invalid('UNREVIEWED_FORMAT');
      const rows: AmericanFootballRow[] = [];
      for (const block of withoutComments(page.wikitext).split(/\n\|-/)) {
        const cells = [...block.matchAll(/^\| ([^\n]+)$/gm)].map(match => match[1].trim());
        if (!cells.length) continue;
        if (cells.length !== 10 || !/^\[\[2026 [^\n]+ season\|[^\n]+\]\]$/.test(cells[0])) return invalid('UNREVIEWED_FORMAT');
        const wins = count(cells[1], 17), losses = count(cells[2], 17), ties = count(cells[3], 17), played = wins + losses + ties;
        const percentage = /^\{\{winpct\|(\d+)\|(\d+)\|(\d+)\}\}$/.exec(cells[4]);
        if (!percentage || percentage.slice(1).some((value, index) => Number(value) !== [wins, losses, ties][index]) || !played || played > 17) return invalid('INCONSISTENT_TABLE');
        rows.push({ entityId: participant(cells[0], 'United States'), rank: rows.length + 1, played, wins, losses, ties, winPercentage: (wins + ties / 2) / played, pointsFor: count(cells[7], 1000), pointsAgainst: count(cells[8], 1000) });
      }
      if (rows.length !== 4 || rows.some((row, index) => index > 0 && row.winPercentage > rows[index - 1].winPercentage)) return invalid('PARTIAL_TABLE');
      tables.push({ type: 'american-football', id: `${division[1]}-${division[2]}`.toLowerCase(), name: `${division[1]} ${division[2]}`, stage: 'Regular season', conference: division[1], division: division[2], rows });
    }
    const rows = tables.flatMap(table => table.type === 'american-football' ? table.rows : []);
    if (rows.length !== 32 || rows.reduce((sum, row) => sum + row.wins - row.losses, 0) || rows.reduce((sum, row) => sum + row.pointsFor - row.pointsAgainst, 0) || rows.reduce((sum, row) => sum + row.ties, 0) % 2) return invalid('INCONSISTENT_TABLE');
  } else {
    for (const page of pages) {
      const division = /^Template:2026 (AL|NL) (East|Central|West) standings$/.exec(page.title), text = withoutComments(page.wikitext).replace(/<noinclude>[\s\S]*?<\/noinclude>/g, '').trim();
      if (!division || !text.startsWith('{{MLB standings') || field(text, 'year') !== '2026' || field(text, 'division') !== `${division[1]} ${division[2]}`) return invalid('UNREVIEWED_FORMAT');
      const inputs = [...text.matchAll(/^\|([^|=\n{}]+)\n\|(\d+)\|(\d+)\n\|(\d+)\|(\d+)\s*$/gm)];
      if (inputs.length !== 5) return invalid('PARTIAL_TABLE');
      const totals = inputs.map(row => ({ name: row[1], wins: count(row[2], 81) + count(row[4], 81), losses: count(row[3], 81) + count(row[5], 81) }));
      const leader = totals[0];
      const rows: BaseballRow[] = totals.map((row, index) => {
        const played = row.wins + row.losses;
        if (!played || played > 162) return invalid('INVALID_PLAYED');
        // Runs are absent in this source. Omit them; zero would be fabricated.
        return { entityId: participant(row.name), rank: index + 1, played, wins: row.wins, losses: row.losses, winPercentage: row.wins / played, gamesBehind: (leader.wins - row.wins + row.losses - leader.losses) / 2 };
      });
      if (rows.some((row, index) => index > 0 && row.winPercentage > rows[index - 1].winPercentage)) return invalid('INCONSISTENT_TABLE');
      tables.push({ type: 'baseball', id: `${division[1]}-${division[2]}`.toLowerCase(), name: `${division[1]} ${division[2]}`, stage: 'Completed regular season', conference: division[1] === 'AL' ? 'American League' : 'National League', division: division[2], rows });
    }
    const rows = tables.flatMap(table => table.type === 'baseball' ? table.rows : []);
    if (rows.length !== 30 || rows.reduce((sum, row) => sum + row.wins - row.losses, 0)) return invalid('INCONSISTENT_TABLE');
  }
  const snapshot: SportsSnapshot = {
    schemaVersion: 1, competitionId: dataset.competitionId, sport: dataset.sport, season: dataset.season,
    stage: dataset.competitionId==='colombia-primera-a'?'Torneo Finalización':dataset.competitionId === 'liga-mx' ? 'Torneo Apertura' : dataset.historical ? 'Completed regular season' : 'Regular season',
    sourceId: 'wikimedia', sourceUrl: dataset.sourceUrl, observedAt, retrievedAt: batch.retrievedAt,
    mode: dataset.historical ? 'historical' : 'manual', observationBasis,
    provenance: provenance.map(item => observationBasis === 'data-date' ? { ...item, dataAsOf: observedAt } : item),
    entities, tables, events: [],
  };
  if (validateSnapshot(snapshot, now).length) return invalid('INVALID_SNAPSHOT');
  return { snapshot, summary: { competitionId: dataset.competitionId, entities: entities.length, tables: tables.length, rows: tables.reduce((sum, table) => sum + table.rows.length, 0), events: 0, observedAt, observationBasis, sourceSha256: batch.sourceSha256, licenseUrl: WIKIMEDIA_LICENSE_URL, warning: observationBasis === 'source-revision' ? 'Revision dates are source-edit times, not verified result cutoffs. Community-maintained figures require Owner review.' : 'Dated community-maintained table; not an official live feed. Review sanctions and tie-break order before publication.' } };
}

export async function previewWikimediaSports(competitionId: string, options: WikimediaFetchOptions = {}): Promise<WikimediaPreview> {
  return normalizeWikimediaSports(await fetchWikimediaDataset(competitionId, options), options.now ?? new Date());
}
