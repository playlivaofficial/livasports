import { WIKIMEDIA_DATASETS } from '../src/multisport/wikimedia-datasets';
import { previewWikimediaSports } from '../src/multisport/wikimedia-football';
import { previewWikimediaMultisport } from '../src/multisport/wikimedia-multisport';

/** Explicit one-dataset manual preview. Stdout only: never imports, reviews, publishes or writes files. */
async function main() {
  const args = process.argv.slice(2), json = args.includes('--json');
  const ids = args.filter(arg => !arg.startsWith('--'));
  if (ids.length !== 1 || args.some(arg => arg.startsWith('--') && arg !== '--json') || !WIKIMEDIA_DATASETS.some(dataset => dataset.competitionId === ids[0])) {
    throw new Error(`Usage: v3-import-wikimedia.ts <${WIKIMEDIA_DATASETS.map(dataset => dataset.competitionId).join('|')}> [--json]`);
  }
  const competitionId = ids[0];
  const preview = ['liga-mx', 'nfl', 'mlb'].includes(competitionId)
    ? await previewWikimediaSports(competitionId)
    : await previewWikimediaMultisport(competitionId);
  process.stdout.write(`${JSON.stringify(json ? preview : preview.summary, null, 2)}\n`);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : '';
  process.stderr.write(`${/^WIKIMEDIA_[A-Z_]+$/.test(message) || message.startsWith('Usage: ') ? message : 'WIKIMEDIA_PREVIEW_FAILED'}\n`);
  process.exitCode = 1;
});
