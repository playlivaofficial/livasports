import { createHash } from 'node:crypto';
import { validateSnapshot, type BasketballTable, type IceHockeyTable, type MmaRow, type MmaTable, type SportsEntity, type SportsSnapshot, type SportsTable, type TennisTable } from './model';
import { fetchWikimediaDataset, getWikimediaDataset, WIKIMEDIA_LICENSE_URL, type WikimediaBatch, type WikimediaFetchOptions } from './wikimedia';

const supported = ['nhl', 'euroleague', 'atp-rankings', 'wta-rankings', 'ufc'];
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fail = (code: string): never => { throw new Error(`WIKIMEDIA_MULTISPORT_${code}`); };
const clean = (value: string) => value.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref\b[^>]*\/>/gi, '').replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '').trim();
function text(value: string): string {
  const result = value.trim();
  if (!result || result.length > 160 || /[<>\[\]{}|\u0000-\u001f\u007f]/.test(result)) fail('TEXT');
  return result;
}
function integer(value: string | undefined, max = 100000): number {
  if (value === undefined || !/^\d+(?:,\d{3})*$/.test(value.trim())) fail('NUMBER');
  const result = Number(value!.trim().replaceAll(',', ''));
  if (!Number.isSafeInteger(result) || result > max) fail('NUMBER');
  return result;
}
function day(year: string, month: string, date: string): string {
  const result = `${year}-${month.padStart(2, '0')}-${date.padStart(2, '0')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) fail('DATE');
  return result;
}
function englishDate(value: string): string {
  const match = value.trim().match(/^(?:(\d{1,2}) ([A-Z][a-z]+)|(\w+) (\d{1,2}),) (\d{4})$/);
  if (!match) return fail('DATE');
  const month = months.indexOf(match[2] ?? match[3]) + 1;
  return day(match[5], String(month), match[1] ?? match[4]);
}
function linkedName(value: string): { title: string; name: string } {
  const links = [...value.matchAll(/\[\[([^\[\]\n]+)\]\]/g)];
  if (!links.length) { const name = text(value); return { title: name, name }; }
  if (links.length !== 1) return fail('PARTICIPANT_LINK');
  const [title, label, extra] = links[0][1].split('|');
  if (extra !== undefined || title.includes('#') || /^(?:File|Image|Category|Template):/i.test(title)) fail('PARTICIPANT_LINK');
  return { title: text(title), name: text(label ?? title) };
}
function parameters(value: string): Map<string, string> {
  // The audited NHL template has an empty status_UTA without '='. It is not a numeric field.
  const source = clean(value).replace(/\|status_[A-Z]{3}(?=\s*(?:\||$))/g, ''), matches = [...source.matchAll(/\|\s*([A-Za-z][A-Za-z0-9_]*)\s*=/g)], result = new Map<string, string>();
  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1], val = source.slice(matches[i].index! + matches[i][0].length, matches[i + 1]?.index ?? source.length).trim();
    if (result.has(key)) fail('DUPLICATE_PARAMETER');
    result.set(key, val);
  }
  return result;
}
function required(params: Map<string, string>, key: string): string { return params.get(key) ?? fail('MISSING_PARAMETER'); }
function participant(entities: Map<string, SportsEntity>, value: string, kind: SportsEntity['kind']): string {
  const { title, name } = linkedName(value), id = `wikimedia-${createHash('sha256').update(`${kind}:${title}`).digest('hex').slice(0, 24)}`;
  const previous = entities.get(id);
  if (previous && previous.name !== name) fail('ENTITY_COLLISION');
  if (!previous) entities.set(id, { id, name, kind });
  return id;
}
function tennis(source: string, tour: 'ATP' | 'WTA', entities: Map<string, SportsEntity>): { tables: TennisTable[]; date: string } {
  const marker = `${tour} singles ranking`, start = `<section begin=${marker} />`, end = `<section end=${marker} />`;
  if (source.split(start).length !== 2 || source.split(end).length !== 2) fail('TENNIS_SECTION');
  const section = source.split(start)[1].split(end)[0], dateParts = section.match(/\{\{As of\|(\d{4})\|(\d{1,2})\|(\d{1,2})\|/);
  if (!dateParts) return fail('DATE');
  const date = day(dateParts[1], dateParts[2], dateParts[3]);
  const rows: TennisTable['rows'] = [];
  for (const block of section.split(/\n\|-\s*\n/).slice(1)) {
    const raw = clean(block).replace(/\|\}[\s\S]*$/, '').trim();
    if (!raw || raw.startsWith('!')) continue;
    const cells = raw.replace(/^\|/, '').split(/\s*\|\|\s*|\n\|/);
    if (cells.length !== 4) fail('TENNIS_ROW');
    const rankText = cells[0].replace(/\[\[[^\]]+\|(\d+)\]\]/, '$1').trim(), rank = integer(rankText, 20);
    const move = cells[3].trim().match(/^\{\{(steady|up|down)\}\}(?:\s+(\d+))?$/);
    if (!move || (move[1] === 'steady' ? move[2] !== undefined : move[2] === undefined)) fail('TENNIS_MOVEMENT');
    const entityId = participant(entities, cells[1], 'player');
    // Country-of-representation tokens are source facts, not flags inferred from names.
    // A noflag athlete stays Neutral; do not infer Russian/Belarusian nationality.
    const code=cells[1].match(/^\s*\{\{flagathlete\|\[\[[^\]]+\]\]\|([A-Z]{3})\}\}\s*$/)?.[1];
    if(code) entities.get(entityId)!.country=code;
    else if(/^\s*\{\{noflag\}\}\s*\[\[[^\]]+\]\]\s*$/.test(cells[1])) entities.get(entityId)!.country='Neutral';
    rows.push({ entityId, rank, points: integer(cells[2]), movement: move![1] === 'steady' ? 0 : integer(move![2]) * (move![1] === 'up' ? 1 : -1) });
  }
  if (rows.length !== 20 || rows.some((row, i) => row.rank !== i + 1)) fail('TENNIS_INCOMPLETE');
  return { date, tables: [{ type: 'tennis', id: `${tour.toLowerCase()}-singles-top20`, name: `${tour} singles rankings — published top 20`, stage: 'Singles rankings (top 20)', rankingDate: date, tour, discipline: 'singles', rankingSystem: 'ranking', rows }] };
}
function hockey(source: string, entities: Map<string, SportsEntity>): { tables: IceHockeyTable[]; date: string; dates: string[] } {
  const divisions = ['Atlantic', 'Metropolitan', 'Central', 'Pacific'];
  const tables: IceHockeyTable[] = [], dates: string[] = [];
  for (const division of divisions) {
    const start = `|${division}={{#invoke:Sports table|main|style=WL OTL tiebreak|param1_valid=y`;
    if (source.split(start).length !== 2) fail('NHL_DIVISION');
    const section = source.split(start)[1].split(/\n\}\}\n/)[0], params = parameters(section), date = englishDate(required(params, 'update'));
    dates.push(date);
    const rows: IceHockeyTable['rows'] = [];
    for (let rank = 1; rank <= 8; rank++) {
      const code = required(params, `team${rank}`).trim();
      if (!/^[A-Z]{3}$/.test(code)) fail('NHL_TEAM');
      const wins = integer(required(params, `win_${code}`), 84), losses = integer(required(params, `loss_${code}`), 84), overtimeLosses = integer(required(params, `OTloss_${code}`), 84);
      rows.push({ rank, entityId: participant(entities, required(params, `name_${code}`), 'club'), played: wins + losses + overtimeLosses, wins, losses, overtimeLosses, points: wins * 2 + overtimeLosses, goalsFor: integer(required(params, `gf_${code}`)), goalsAgainst: integer(required(params, `ga_${code}`)), regulationWins: integer(required(params, `tiebr_${code}`), 84) });
    }
    if (params.has('team9') || rows.some(row => row.played > 84)) fail('NHL_SIZE');
    tables.push({ type: 'ice-hockey', id: division.toLowerCase(), name: `${division} Division — ${date}`, stage: 'Regular season', division, conference: ['Atlantic', 'Metropolitan'].includes(division) ? 'Eastern' : 'Western', rows });
  }
  if (entities.size !== 32) fail('NHL_INCOMPLETE');
  // Division source dates can differ; the whole snapshot uses the oldest, never the newest.
  return { tables, date: [...dates].sort()[0], dates };
}
function basketball(source: string, entities: Map<string, SportsEntity>): { tables: BasketballTable[]; date: string } {
  const start = '== League table ==';
  if (source.split(start).length !== 2) fail('EUROLEAGUE_SECTION');
  const section = source.split(start)[1].split('== Round by round tables ==')[0], params = parameters(section);
  const codes = required(params, 'team_order').split(',').map(code => code.trim()), date = englishDate(required(params, 'update'));
  if (codes.length !== 20 || new Set(codes).size !== 20 || codes.some(code => !/^[A-Z]{3}$/.test(code))) fail('EUROLEAGUE_TEAMS');
  const rows: BasketballTable['rows'] = codes.map((code, index) => {
    const wins = integer(required(params, `win_${code}`), 38), losses = integer(required(params, `loss_${code}`), 38), played = wins + losses;
    if (played > 38) fail('EUROLEAGUE_SIZE');
    return { entityId: participant(entities, required(params, `name_${code}`), 'club'), rank: index + 1, played, wins, losses, winPercentage: played ? wins / played : 0, pointsFor: integer(required(params, `gf_${code}`)), pointsAgainst: integer(required(params, `ga_${code}`)) };
  });
  const pointsBalance = rows.reduce((sum, row) => {
    if (row.pointsFor === undefined || row.pointsAgainst === undefined) return fail('EUROLEAGUE_MISSING_POINTS');
    return sum + row.pointsFor - row.pointsAgainst;
  }, 0);
  if (entities.size !== 20 || rows.reduce((sum, row) => sum + row.wins - row.losses, 0) !== 0 || pointsBalance !== 0) fail('EUROLEAGUE_TOTALS');
  return { date, tables: [{ type: 'basketball', id: 'regular-season', name: 'Regular season — source standings points exclude overtime', stage: 'Regular season', rows }] };
}
const mmaClasses = { Men: ['Heavyweight', 'Light Heavyweight', 'Middleweight', 'Welterweight', 'Lightweight', 'Featherweight', 'Bantamweight', 'Flyweight'], Women: ['Bantamweight', 'Flyweight', 'Strawweight'] } as const;
function mma(source: string, entities: Map<string, SportsEntity>): { tables: MmaTable[]; date: string } {
  const tables: MmaTable[] = [], dates: string[] = [];
  const headings = [...source.matchAll(/^==\s*(Men|Women)'s Meta rankings\s*==\s*$/gm)];
  if (headings.length !== 2 || headings[0][1] !== 'Men' || headings[1][1] !== 'Women') fail('MMA_SYSTEM');
  for (const heading of headings) {
    const gender = heading[1] as keyof typeof mmaClasses, start = heading.index! + heading[0].length;
    const rest = source.slice(start), section = rest.split(/^==[^=]/m)[0];
    const classes = [...section.matchAll(/^===\s*([^=]+?)\s*===\s*$/gm)];
    if (classes.length !== mmaClasses[gender].length) fail('MMA_CLASSES');
    for (let index = 0; index < classes.length; index++) {
      const weightClass = classes[index][1].trim().replace(new RegExp(`^${gender}'s\\s+`, 'i'), '');
      if (weightClass.toLowerCase() !== mmaClasses[gender][index].toLowerCase()) fail('MMA_CLASS');
      const content = section.slice(classes[index].index! + classes[index][0].length, classes[index + 1]?.index ?? section.length);
      const released = content.match(/Rankings released on ([A-Za-z]+ \d{1,2}, \d{4}),/);
      if (!released) return fail('DATE');
      const date = englishDate(released[1]); dates.push(date);
      const rows: MmaRow[] = [];
      for (const block of content.split(/\n\|-\s*\n/).slice(1)) {
        const raw = clean(block).replace(/\|\}[\s\S]*$/, '').trim();
        if (!raw || !/^!\s*(?:\d+\s*\n|style=[^\n]*\{\{Tooltip\|C\|Champion\}\}\s*\n)/i.test(raw)) continue;
        const cells = raw.split(/\n\|/), rankCell = cells[0], champion = rankCell.includes('{{Tooltip|C|Champion}}');
        if (cells.length < 4) fail('MMA_ROW');
        const rank = champion ? 0 : integer(rankCell.replace(/^!\s*/, ''), 15);
        const record = cells[3].replace(/^\s*align\s*=\s*"?center"?\s*\|/, '').replace(/<br\s*\/?\s*>/gi, ' ').trim()
          // The audited page wraps either the full record or just W-L-D.
          // Unwrap only this numeric grammar, never execute arbitrary templates.
          .replace(/\{\{nowrap\|(\d+[–-]\d+(?:[–-]\d+)?(?:\s*\(\d+ NC\))?)\}\}/g, '$1').trim();
        const numbers = record.match(/^(\d+)[–-](\d+)(?:[–-](\d+))?(?:\s*\((\d+) NC\))?$/);
        if (!numbers) fail('MMA_RECORD');
        rows.push({ entityId: participant(entities, cells[2], 'fighter'), rank, ...(champion ? { champion: true } : {}), wins: integer(numbers![1], 200), losses: integer(numbers![2], 200), draws: numbers![3] ? integer(numbers![3], 100) : 0, noContests: numbers![4] ? integer(numbers![4], 100) : 0 });
      }
      const contenders = rows.filter(row => !row.champion);
      if (rows.filter(row => row.champion).length > 1 || contenders.length !== 15 || contenders.some((row, i) => row.rank !== i + 1)) fail('MMA_INCOMPLETE');
      const name = `${gender}'s ${weightClass}`, id = `meta-${gender.toLowerCase()}-${weightClass.toLowerCase().replaceAll(' ', '-')}`;
      tables.push({ type: 'mma', id, name: `Meta UFC — ${name}`, stage: 'Meta UFC rankings', rankingDate: date, rankingCategory: 'weight-class', rankingSystem: 'meta', weightClass: name, rows });
    }
  }
  if (new Set(dates).size !== 1) fail('MMA_MIXED_DATES');
  return { tables, date: dates[0] };
}

export interface WikimediaMultisportPreview {
  snapshot: SportsSnapshot;
  summary: { competitionId: string; entities: number; tables: number; rows: number; events: 0; sourceUrl: string; licenseUrl: string; sourceSha256: string | null; dataAsOf: string; attribution: string; limitations: string[] };
}
/** Fixed audited pages only. No HTML execution, template expansion, images, invented fixtures or ranking-derived seeds. */
export function normalizeWikimediaMultisport(batch: WikimediaBatch, now = new Date()): WikimediaMultisportPreview {
  if (!supported.includes(batch.dataset.competitionId)) fail('NOT_SUPPORTED');
  const config = getWikimediaDataset(batch.dataset.competitionId);
  if (batch.dataset.sourceUrl !== config.sourceUrl || batch.dataset.season !== config.season || batch.dataset.sport !== config.sport || batch.pages.length !== 1 || batch.pages[0].title !== config.titles[0]) fail('DATASET');
  const page = batch.pages[0];
  if (typeof page.wikitext !== 'string' || !page.wikitext.trim() || page.wikitext.length > 300000) fail('CONTENT');
  const entities = new Map<string, SportsEntity>(); let parsed: { tables: SportsTable[]; date: string; dates?: string[] };
  switch (config.competitionId) {
    case 'nhl': parsed = hockey(page.wikitext, entities); break;
    case 'euroleague': parsed = basketball(page.wikitext, entities); break;
    case 'atp-rankings': parsed = tennis(page.wikitext, 'ATP', entities); break;
    case 'wta-rankings': parsed = tennis(page.wikitext, 'WTA', entities); break;
    case 'ufc': parsed = mma(page.wikitext, entities); break;
    default: return fail('NOT_SUPPORTED');
  }
  const firstYear = Number(config.season.slice(0, 4)), lastYear = firstYear + (config.season.includes('/') ? 1 : 0);
  for (const date of parsed.dates ?? [parsed.date]) {
    const year = Number(date.slice(0, 4));
    if (year < firstYear || year > lastYear || date > page.revisionTimestamp.slice(0, 10) || date > batch.retrievedAt.slice(0, 10) || date > now.toISOString().slice(0, 10)) fail('SEASON_DATE');
  }
  const snapshot: SportsSnapshot = { schemaVersion: 1, competitionId: config.competitionId, sport: config.sport, season: config.season, stage: parsed.tables[0].stage, sourceId: 'wikimedia', sourceUrl: config.sourceUrl, observedAt: parsed.date, retrievedAt: batch.retrievedAt, mode: 'manual', observationBasis: 'data-date', provenance: [{ title: page.title, revisionId: page.revisionId, revisionTimestamp: page.revisionTimestamp, dataAsOf: parsed.date }], entities: [...entities.values()], tables: parsed.tables, events: [] };
  if (validateSnapshot(snapshot, now).length) fail('INVALID_SNAPSHOT');
  return { snapshot, summary: { competitionId: config.competitionId, entities: entities.size, tables: parsed.tables.length, rows: parsed.tables.reduce((sum, table) => sum + table.rows.length, 0), events: 0, sourceUrl: config.sourceUrl, licenseUrl: WIKIMEDIA_LICENSE_URL, sourceSha256: batch.sourceSha256, dataAsOf: parsed.date, attribution: `Adapted from Wikipedia contributors, ${page.title}, revision ${page.revisionId}, CC BY-SA 4.0. Normalized factual fields; no media copied.`, limitations: ['Community-maintained snapshot, not an official live feed. Owner review required.', ...(config.sport === 'tennis' ? ['Only the published singles top 20; no race, doubles, draw seeds or tournament fixtures.'] : config.sport === 'mma' ? ['Meta system weight-class rankings only; media-panel and pound-for-pound tables are intentionally excluded.'] : config.sport === 'ice-hockey' ? ['Division dates may differ; each table names its date and the snapshot uses the oldest. Wild-card tables are excluded.'] : ['Standings only; source points exclude overtime.']), 'No automatic polling or publication.'] } };
}

/** One bounded manual preview request through the shared transport; never writes to the database. */
export async function previewWikimediaMultisport(competitionId: string, options: WikimediaFetchOptions = {}): Promise<WikimediaMultisportPreview> {
  if (!supported.includes(competitionId)) fail('NOT_SUPPORTED');
  const batch = await fetchWikimediaDataset(competitionId, options);
  return normalizeWikimediaMultisport(batch, options.now ?? new Date());
}
