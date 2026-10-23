import { describe, expect, it } from 'vitest';
import { getWikimediaDataset, type WikimediaBatch } from './wikimedia';
import { normalizeWikimediaSports } from './wikimedia-football';

const now = new Date('2026-10-19T12:00:00Z');
/** Artificial balanced unit fixtures only; these are never source data or publications. */
function fixture(id: string): WikimediaBatch {
  const dataset = getWikimediaDataset(id);
  return { dataset, retrievedAt: now.toISOString(), sourceSha256: null, pages: dataset.titles.map((title, pageIndex) => {
    let wikitext: string;
    if (id === 'liga-mx') {
      const codes = Array.from({ length: 18 }, (_, index) => `A${String.fromCharCode(65 + index)}`);
      wikitext = `{{#invoke:Sports table|main|style=WDL\n|update=18 October 2026\n|team_order=${codes.join(',')}\n${codes.map((code, index) => `|win_${code}=2 |draw_${code}=3 |loss_${code}=2 |gf_${code}=5 |ga_${code}=5\n|name_${code}=[[Club ${index + 1}]]`).join('\n')}\n}}`;
    } else if (id === 'nfl') {
      wikitext = `{|\n${Array.from({ length: 4 }, (_, row) => `|-\n| [[2026 Club ${pageIndex}-${row} season|Club ${pageIndex}-${row}]]\n| 5\n| 5\n| 0\n| {{winpct|5|5|0}}\n| 1–1\n| 2–2\n| 150\n| 150\n| W1`).join('\n')}\n|}`;
    } else {
      const division = title.replace('Template:2026 ', '').replace(' standings', '');
      wikitext = `{{MLB standings\n|division=${division}\n|year=2026\n${Array.from({ length: 5 }, (_, row) => `|Club ${pageIndex}-${row}\n|41|40\n|40|41`).join('\n')}\n}}`;
    }
    return { title, revisionId: 1000 + pageIndex, revisionTimestamp: `2026-10-18T${String(12 + pageIndex).padStart(2, '0')}:00:00Z`, wikitext };
  }) };
}

describe('Wikimedia factual table adapters', () => {
  it('preserves Liga MX actual date-only cutoff without inventing kickoff or fixtures', () => {
    const preview = normalizeWikimediaSports(fixture('liga-mx'), now);
    expect(preview.snapshot.entities).toHaveLength(18);
    expect(preview.snapshot.observedAt).toBe('2026-10-18');
    expect(preview.snapshot.observationBasis).toBe('data-date');
    expect(preview.snapshot.mode).toBe('manual');
    expect(preview.snapshot.events).toEqual([]);
    expect(preview.snapshot.provenance?.[0].dataAsOf).toBe('2026-10-18');
  });
  it('preserves all NFL divisions and uses oldest contributing revision, never fetch time', () => {
    const preview = normalizeWikimediaSports(fixture('nfl'), now);
    expect(preview.snapshot.entities).toHaveLength(32); expect(preview.snapshot.tables).toHaveLength(8);
    expect(preview.snapshot.observedAt).toBe('2026-10-18T12:00:00Z');
    expect(preview.snapshot.observationBasis).toBe('source-revision');
    expect(preview.snapshot.provenance).toHaveLength(8);
  });
  it('keeps MLB completed regular season historical and absent run totals absent', () => {
    const batch = fixture('mlb');
    // The audited AL West page prefixes the table with non-transcluded metadata.
    batch.pages[2].wikitext = `<noinclude>{{Short description|Baseball template}}</noinclude>${batch.pages[2].wikitext}`;
    const preview = normalizeWikimediaSports(batch, now);
    expect(preview.snapshot.entities).toHaveLength(30); expect(preview.snapshot.tables).toHaveLength(6);
    expect(preview.snapshot.mode).toBe('historical');
    expect(preview.snapshot.tables[0].rows[0]).not.toHaveProperty('runsFor');
    expect(preview.snapshot.tables[0].rows[0]).not.toHaveProperty('runsAgainst');
  });
  it('rejects partial tables, duplicate teams, source-format drift, unreviewed deductions and inconsistent totals', () => {
    const partial = fixture('liga-mx'); partial.pages[0].wikitext = partial.pages[0].wikitext.replace(',AR', '');
    expect(() => normalizeWikimediaSports(partial, now)).toThrow();
    const missing = fixture('liga-mx'); missing.pages[0].wikitext = missing.pages[0].wikitext.replace('|gf_AA=5', '');
    expect(() => normalizeWikimediaSports(missing, now)).toThrow();
    const totals = fixture('liga-mx'); totals.pages[0].wikitext = totals.pages[0].wikitext.replace('|gf_AA=5', '|gf_AA=6');
    expect(() => normalizeWikimediaSports(totals, now)).toThrow('INCONSISTENT');
    const deduction = fixture('liga-mx'); deduction.pages[0].wikitext += '\n|adjust_points_AA=-3';
    expect(() => normalizeWikimediaSports(deduction, now)).toThrow('UNREVIEWED');
    const nfl = fixture('nfl'); nfl.pages[0].wikitext = nfl.pages[0].wikitext.replace('| 150', '| 151');
    expect(() => normalizeWikimediaSports(nfl, now)).toThrow('INCONSISTENT');
    const mlb = fixture('mlb'); mlb.pages[0].wikitext = mlb.pages[0].wikitext.replace('|Club 0-1', '|Club 0-0');
    expect(() => normalizeWikimediaSports(mlb, now)).toThrow('DUPLICATE_ENTITY');
  });
});
