import { readFile,writeFile } from 'node:fs/promises';
import { databaseUrl,PostgresDatabaseClient } from '../src/database/client';
import { sportmonksUtc } from '../src/providers/sportmonks/utc';
interface Evidence {
  providerId:number;name:string;starting_at:string;starting_at_timestamp:number;league_id:number;
  participants:Array<{id:number;meta:{location:string}}>;
  state:{developer_name:string};
  canonical:{id:string;kickoff:string;provider_entity_id:string;home_provider_id:string;away_provider_id:string};
}
const db=new PostgresDatabaseClient(databaseUrl()!);
try {
  const supplement=process.argv.includes('--supplement');
  const audit=JSON.parse(await readFile(supplement?'output/m5-kickoff-supplement-private.json':'output/m5-kickoff-private.json','utf8')) as {status:number;at:string;evidence:Evidence[]};
  if(audit.status!==200||audit.evidence.length!==(supplement?42:8))throw new Error('Unexpected diagnostic evidence');
  const apply=process.argv.includes('--apply');
  const result=await db.transaction(async tx=>{
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('livasports-m5-kickoff-evidence-repair'))");
    const changes=[];
    for(const source of audit.evidence){
      const current=(await tx.query(`SELECT f.id,f.public_id,f.kickoff,f.status,cm.provider_entity_id AS league,
        fm.provider_entity_id AS fixture,hm.provider_entity_id AS home,am.provider_entity_id AS away
        FROM fixtures f
        JOIN provider_entity_mappings fm ON fm.livasports_entity_id=f.id AND fm.provider='SPORTMONKS' AND fm.entity_type='FIXTURE'
        JOIN provider_entity_mappings cm ON cm.livasports_entity_id=f.competition_id AND cm.provider='SPORTMONKS' AND cm.entity_type='COMPETITION'
        JOIN provider_entity_mappings hm ON hm.livasports_entity_id=f.home_team_id AND hm.provider='SPORTMONKS' AND hm.entity_type='TEAM'
        JOIN provider_entity_mappings am ON am.livasports_entity_id=f.away_team_id AND am.provider='SPORTMONKS' AND am.entity_type='TEAM'
        WHERE f.id=$1 FOR UPDATE OF f`,[source.canonical.id])).rows[0];
      const target=sportmonksUtc(source.starting_at,source.starting_at_timestamp);
      if(!current||current.fixture!==String(source.providerId)||current.league!==String(source.league_id)||
        current.home!==String(source.participants.find(p=>p.meta.location==='home')?.id)||current.away!==String(source.participants.find(p=>p.meta.location==='away')?.id)||
        target.getTime()!==sportmonksUtc(source.starting_at).getTime()||source.state.developer_name!=='NS'||current.status!=='SCHEDULED')throw new Error('Provider evidence identity/UTC/status conflict');
      const alreadyCorrect=current.kickoff.getTime()===target.getTime();
      if(!alreadyCorrect&&current.kickoff.toISOString()!==source.canonical.kickoff)throw new Error('Fixture changed since audit; re-verification required');
      const diffMinutes=(target.getTime()-Date.parse(source.canonical.kickoff))/60000;
      const reason=diffMinutes===240?'UTC_PARSE_DEFECT_PROVEN':'UTC_PARSE_DEFECT_AND_SOURCE_SCHEDULE_CHANGE';
      const action=alreadyCorrect?'UNCHANGED':apply?'CORRECTED':'WOULD_CORRECT';
      if(apply&&!alreadyCorrect){
        await tx.query('UPDATE fixtures SET kickoff=$2,updated_at=now() WHERE id=$1',[current.id,target]);
        await tx.query(`UPDATE provider_entity_mappings SET metadata=metadata||jsonb_build_object('m5KickoffCorrection',$2::jsonb),updated_at=now()
          WHERE provider='SPORTMONKS' AND entity_type='FIXTURE' AND livasports_entity_id=$1`,[current.id,JSON.stringify({observedAt:audit.at,before:source.canonical.kickoff,after:target.toISOString(),reason,providerEpoch:source.starting_at_timestamp})]);
      }
      changes.push({id:current.id,publicId:current.public_id,name:source.name,action,before:source.canonical.kickoff,after:target.toISOString(),reason,
        status:current.status,wasAfterStoredKickoff:Date.now()>=Date.parse(source.canonical.kickoff),afterVerifiedKickoff:Date.now()>=target.getTime()});
    }
    return {at:new Date().toISOString(),apply,evidenceFixtures:audit.evidence.length,changed:changes.filter(c=>c.action==='CORRECTED').length,changes,providerRequests:0};
  });
  await writeFile(`output/m5-kickoff-${supplement?'supplement-':''}${apply?'repair':'plan'}-private.json`,JSON.stringify(result,null,2));console.info(JSON.stringify(result));
}catch {console.error('Kickoff correction aborted safely; no global shifts or identity changes');process.exitCode=1;}
finally {await db.close();}
