import { describe, expect, it } from 'vitest';
import { normalizeWikimediaMultisport, previewWikimediaMultisport } from './wikimedia-multisport';
import { getWikimediaDataset, type WikimediaBatch } from './wikimedia';
import { validateSnapshot } from './model';

// Entirely synthetic TEST data. These rows are never production snapshots or published sports facts.
const now = new Date('2026-10-19T12:00:00Z');
function batch(id: string, wikitext: string): WikimediaBatch {
  const dataset = getWikimediaDataset(id);
  return { dataset, retrievedAt: now.toISOString(), sourceSha256: null, pages: [{ title: dataset.titles[0], revisionId: 123, revisionTimestamp: '2026-10-18T10:00:00Z', wikitext }] };
}
function tennis(tour = 'ATP'): string {
  return `<section begin=${tour} singles ranking />\n{|\n! [[${tour} rankings]] {{As of|2026|10|5|df=UK|lc=y}}\n|-\n!No\n!Player\n!Points\n!Move\n${Array.from({ length: 20 }, (_, index) => `|-\n|${index === 0 ? '[[List of TEST number 1 players|1]]' : index + 1}\n|{{flagathlete|[[TEST Player ${index}]]|ITA}} || ${1000 - index} || ${index === 1 ? '{{up}} 2' : index === 2 ? '{{down}} 1' : '{{steady}}'}\n`).join('')}|}<section end=${tour} singles ranking />`;
}
const divisions = ['Atlantic', 'Metropolitan', 'Central', 'Pacific'];
function hockey(): string {
  return divisions.map((division, divisionIndex) => {
    const codes = Array.from({ length: 8 }, (_, index) => `T${String.fromCharCode(65 + divisionIndex)}${String.fromCharCode(65 + index)}`);
    return `|${division}={{#invoke:Sports table|main|style=WL OTL tiebreak|param1_valid=y\n|update = October ${divisionIndex ? 18 : 17}, 2026\n${codes.map((code, index) => `|team${index + 1}=${code} |win_${code}=3|loss_${code}=2|OTloss_${code}=1|tiebr_${code}=2|gf_${code}=20|ga_${code}=19|status_${code}${index === 2 ? '' : '='}\n`).join('')}${codes.map(code => `|name_${code}=[[TEST NHL ${code} season|TEST Club ${code}]]\n`).join('')}}}\n`;
  }).join('');
}
function basketball(): string {
  const codes = Array.from({ length: 20 }, (_, index) => `TA${String.fromCharCode(65 + index)}`);
  return `== League table ==\n{{#invoke:Sports table|main|style=WL\n|team_order=${codes.join(', ')}\n|update=16 October 2026\n${codes.map((code, index) => `|win_${code}=${index < 10 ? 2 : 1}|loss_${code}=${index < 10 ? 1 : 2}|gf_${code}=100|ga_${code}=100\n|name_${code}={{#invoke:bka|icon|ITA}} [[TEST Basketball ${code}|TEST Club ${code}]]\n`).join('')}}\n== Round by round tables ==`;
}
function mma(): string {
  const classes = { Men: ['Heavyweight', 'Light Heavyweight', 'Middleweight', 'Welterweight', 'Lightweight', 'Featherweight', 'Bantamweight', 'Flyweight'], Women: ['Bantamweight', 'Flyweight', 'Strawweight'] };
  return Object.entries(classes).map(([gender, names]) => `==${gender}'s Meta rankings==\n${names.map((name, index) => `=== ${name} ===\nRankings released on October 10, 2026, after [[TEST event]].\n{|\n! Rank\n! ISO\n! Fighter\n! Record\n|-\n! Result\n! Event\n${Array.from({ length: 16 }, (_, rank) => `|-\n! ${rank ? rank : 'style="background:gold"|{{Tooltip|C|Champion}}'}\n| {{flagicon|ITA}}\n| ${rank === 2 ? `TEST Fighter ${gender} ${index} ${rank}` : `[[TEST Fighter ${gender} ${index} ${rank}]]`}\n| align=center| ${rank === 3 ? '{{nowrap|14–3–1<br />(1 NC)}}' : '12–2'}\n| {{steady}}\n`).join('')}|}\n`).join('')}`).join('') + '== Men\'s media rankings ==\n[[TEST historical media data excluded]]';
}

describe('bounded Wikimedia multisport normalization', () => {
  it.each(['ATP', 'WTA'])('rejects relabelling a reviewed %s singles ranking as another tour, doubles or race', tour => {
    const valid = normalizeWikimediaMultisport(batch(`${tour.toLowerCase()}-rankings`, tennis(tour)), now).snapshot;
    for (const patch of [{ tour: tour === 'ATP' ? 'WTA' : 'ATP' }, { tour: 'ITF' }, { discipline: 'doubles' }, { rankingSystem: 'race' }]) {
      const changed = structuredClone(valid); Object.assign(changed.tables[0], patch);
      expect(validateSnapshot(changed, now).join('\n')).toContain('reviewed singles ranking');
    }
  });
  it('rejects relabelling the reviewed Meta UFC dataset as media or pound-for-pound rankings', () => {
    const valid = normalizeWikimediaMultisport(batch('ufc', mma()), now).snapshot;
    for (const patch of [{ rankingSystem: 'media' }, { rankingSystem: undefined }, { rankingCategory: 'pound-for-pound' }]) {
      const changed = structuredClone(valid); Object.assign(changed.tables[0], patch);
      if (patch.rankingSystem === undefined && Object.hasOwn(patch, 'rankingSystem') && changed.tables[0].type === 'mma') delete changed.tables[0].rankingSystem;
      expect(validateSnapshot(changed, now).join('\n')).toContain('reviewed Meta weight-class');
    }
  });
  it.each(['ATP', 'WTA'])('preserves the %s published top20, dates and signed movement without race or seeds', tour => {
    const result = normalizeWikimediaMultisport(batch(`${tour.toLowerCase()}-rankings`, tennis(tour)), now);
    expect(result.snapshot.entities).toHaveLength(20);
    expect(result.snapshot.tables[0].rows).toHaveLength(20);
    expect(result.snapshot.tables[0]).toMatchObject({ rankingDate: '2026-10-05', rankingSystem: 'ranking', discipline: 'singles', tour });
    expect(result.snapshot.tables[0].rows[1]).toMatchObject({ movement: 2 });
    expect(result.snapshot.tables[0].rows[2]).toMatchObject({ movement: -1 });
    expect(result.snapshot).toMatchObject({ mode: 'manual', observedAt: '2026-10-05', observationBasis: 'data-date', events: [] });
    expect(result.snapshot.seeds).toBeUndefined();
    expect(result.summary.attribution).toContain('CC BY-SA 4.0');
  });
  it('requires all four NHL divisions and preserves the oldest source day', () => {
    const result = normalizeWikimediaMultisport(batch('nhl', hockey()), now);
    expect(result.snapshot.entities).toHaveLength(32);
    expect(result.snapshot.tables).toHaveLength(4);
    expect(result.snapshot.observedAt).toBe('2026-10-17');
    expect(result.snapshot.tables[0]).toMatchObject({ division: 'Atlantic', conference: 'Eastern', name: 'Atlantic Division — 2026-10-17' });
    expect(result.snapshot.tables[3]).toMatchObject({ division: 'Pacific', conference: 'Western' });
    expect(result.snapshot.tables[0].rows[0]).toMatchObject({ played: 6, points: 7, regulationWins: 2 });
  });
  it('retains EuroLeague source order and standings points, without invented games', () => {
    const result = normalizeWikimediaMultisport(batch('euroleague', basketball()), now);
    expect(result.snapshot.entities).toHaveLength(20);
    expect(result.snapshot.tables[0].rows[0]).toMatchObject({ played: 3, wins: 2, losses: 1, winPercentage: 2 / 3, pointsFor: 100 });
    expect(result.summary.limitations.join(' ')).toContain('exclude overtime');
    expect(result.snapshot.events).toEqual([]);
  });
  it('keeps all eleven Meta weight classes, champion labels and NC separate from media rankings', () => {
    const result = normalizeWikimediaMultisport(batch('ufc', mma()), now);
    expect(result.snapshot.tables).toHaveLength(11);
    expect(result.summary.rows).toBe(176);
    expect(result.snapshot.tables.every(table => table.type === 'mma' && table.rankingSystem === 'meta')).toBe(true);
    expect(result.snapshot.tables[0].rows[0]).toMatchObject({ rank: 0, champion: true, wins: 12, losses: 2, draws: 0, noContests: 0 });
    expect(result.snapshot.tables[0].rows[3]).toMatchObject({ rank: 3, wins: 14, losses: 3, draws: 1, noContests: 1 });
    expect(result.snapshot.entities.some(entity => entity.name.includes('media'))).toBe(false);
    expect(result.snapshot.tables[8]).toMatchObject({ rankingCategory: 'weight-class', weightClass: "Women's Bantamweight" });
  });
  it('accepts a numeric nowrap record with an external NC suffix without losing the draw or NC', () => {
    const result = normalizeWikimediaMultisport(batch('ufc', mma().replace('12–2', '{{nowrap|24–9–1}}<br>(1 NC)')), now);
    expect(result.snapshot.tables[0].rows[0]).toMatchObject({ wins: 24, losses: 9, draws: 1, noContests: 1 });
  });
  it('does not interpret arbitrary or nested templates as fighter records', () => {
    for (const record of ['{{nowrap|unknown}}', '{{unsafe|12–2}}', '{{nowrap|{{nowrap|12–2}}}}', '{{nowrap|12–2}} forged']) {
      expect(() => normalizeWikimediaMultisport(batch('ufc', mma().replace('12–2', record)), now)).toThrow('WIKIMEDIA_MULTISPORT_MMA_RECORD');
    }
  });
  it('accepts the explicit women’s prefix only in its matching Meta section', () => {
    const source = mma().split("==Women's Meta rankings==");
    source[1] = source[1].replace(/=== (Bantamweight|Flyweight|Strawweight) ===/g, "=== Women's $1 ===");
    const result = normalizeWikimediaMultisport(batch('ufc', source.join("==Women's Meta rankings==")), now);
    expect(result.snapshot.tables[8]).toMatchObject({ weightClass: "Women's Bantamweight" });
    expect(() => normalizeWikimediaMultisport(batch('ufc', mma().replace('=== Heavyweight ===', "=== Women's Heavyweight ===")), now)).toThrow('WIKIMEDIA_MULTISPORT_MMA_CLASS');
  });
  it.each([
    ['tennis missing row', 'atp-rankings', () => tennis().replace('|20\n', '|21\n')],
    ['tennis duplicate player', 'atp-rankings', () => tennis().replace('[[TEST Player 19]]', '[[TEST Player 0]]')],
    ['tennis missing movement', 'atp-rankings', () => tennis().replace('{{up}} 2', '{{up}}')],
    ['tennis invalid day', 'atp-rankings', () => tennis().replace('|2026|10|5|', '|2026|2|30|')],
    ['tennis future date', 'atp-rankings', () => tennis().replace('|2026|10|5|', '|2026|11|5|')],
    ['NHL missing division', 'nhl', () => hockey().replace('|Pacific=', '|Unknown=')],
    ['NHL invalid numeric field', 'nhl', () => hockey().replace('|gf_TAA=20', '|gf_TAA=20<script>')],
    ['NHL duplicate field', 'nhl', () => hockey().replace('|gf_TAA=20', '|gf_TAA=20|gf_TAA=21')],
    ['NHL later division cannot hide a future date behind oldest division', 'nhl', () => hockey().replace('October 18, 2026', 'October 18, 2028')],
    ['EuroLeague missing team', 'euroleague', () => basketball().replace(', TAT', '')],
    ['EuroLeague wrong totals', 'euroleague', () => basketball().replace('|gf_TAA=100', '|gf_TAA=101')],
    ['MMA missing ranking', 'ufc', () => mma().replace('! 15\n', '! 17\n')],
    ['MMA system changed', 'ufc', () => mma().replace("==Men's Meta rankings==", "==Men's media rankings==")],
    ['MMA invalid record', 'ufc', () => mma().replace('12–2', '12–unknown')],
  ] as const)('fails closed: %s', (_label, id, source) => {
    expect(() => normalizeWikimediaMultisport(batch(id, source()), now)).toThrow(/^WIKIMEDIA_MULTISPORT_/);
  });
  it('rejects a mismatched provenance page and oversized source before parsing', () => {
    const input = batch('atp-rankings', tennis()); input.pages[0].title = 'Unapproved table';
    expect(() => normalizeWikimediaMultisport(input, now)).toThrow('WIKIMEDIA_MULTISPORT_DATASET');
    expect(() => normalizeWikimediaMultisport(batch('atp-rankings', 'x'.repeat(300001)), now)).toThrow('WIKIMEDIA_MULTISPORT_CONTENT');
  });
  it('does not request unsupported datasets', async () => {
    await expect(previewWikimediaMultisport('unapproved')).rejects.toThrow('WIKIMEDIA_MULTISPORT_NOT_SUPPORTED');
  });
});
