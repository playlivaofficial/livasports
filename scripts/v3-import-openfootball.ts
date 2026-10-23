/** Manual, bounded CC0 archive preview only. This script never reads secrets or writes a database/file. */
import {collectOpenFootballArchives} from '../src/multisport/openfootball';

const args=process.argv.slice(2);
if(args.some(arg=>!['--json','--help'].includes(arg))){process.stderr.write('Allowed options: --json, --help. No database import/publish option exists.\n');process.exitCode=1;}
else if(args.includes('--help'))process.stdout.write('Preview four audited OpenFootball 2026/27 league archives (four requests maximum). Default: summaries. --json: full validated historical snapshots for explicit Owner review/import. No tables, future fixtures, database writes, files or polling.\n');
else{
  try{
    const previews=await collectOpenFootballArchives();
    process.stdout.write(JSON.stringify({mode:'manual-preview-only',license:'CC0-1.0',auditedCutoff:'2026-09-20',summaries:previews.map(item=>item.summary),...(args.includes('--json')?{snapshots:previews.map(item=>item.snapshot)}:{})},null,2)+'\n');
  }catch(error){
    const message=error instanceof Error?error.message:'';
    process.stderr.write((/^OPENFOOTBALL_[A-Z_]+$/.test(message)?message:'OPENFOOTBALL_PREVIEW_FAILED')+'\n');process.exitCode=1;
  }
}
