import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {PostgresDatabaseClient,databaseUrl} from '../src/database/client';
import {readGrowthDashboard,rankGrowthInventory,runGrowthGeneration} from '../src/growth/service';
import {buildShortlist} from '../src/growth/shortlist';
import {enrichGrowthStorySignals,readGrowthVideo,readGrowthItem} from '../src/growth/repository';
import {markGrowthPosted} from '../src/growth/manual-repository';
import {generatedContent} from '../src/growth/content';
import {renderGrowthVideo} from '../src/growth/video-renderer';
import {renderCanonicalStatics} from '../src/growth/canonical-renderer';
import {databaseVoiceStore} from '../src/growth/voice-store';
import {ElevenLabsVoiceProvider} from '../src/growth/voice';
const command=process.argv[2],db=new PostgresDatabaseClient(databaseUrl()!);
const out=join(process.cwd(),'.qa-master');
try{
 if(process.argv.includes('--production-voice')){
  const auth=JSON.parse(await readFile(join(process.env.APPDATA!,'com.vercel.cli/Data/auth.json'),'utf8'));
  const project='prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr',team='team_rtsOqa3gRkQZwndpkXwyMDno',headers={Authorization:`Bearer ${auth.token}`};
  const list=await fetch(`https://api.vercel.com/v10/projects/${project}/env?teamId=${team}`,{headers});if(!list.ok)throw Error('VOICE_ENV_UNAVAILABLE');
  const envs=(await list.json()).envs;
  for(const key of ['ELEVENLABS_API_KEY','ELEVENLABS_VOICE_EDITORIAL','ELEVENLABS_VOICE_ENERGETIC']){
   const entry=envs.find((e:{key:string;target:string[]})=>e.key===key&&e.target.includes('production'));if(!entry)continue;
   const response=await fetch(`https://api.vercel.com/v1/projects/${project}/env/${encodeURIComponent(entry.id)}?teamId=${team}`,{headers});
   if(!response.ok)throw Error('VOICE_ENV_UNAVAILABLE');const value=await response.json();if(!value.decrypted)throw Error('VOICE_ENV_UNAVAILABLE');process.env[key]=value.value;
  }
 }
 if(command==='receipt-check'){
  // Fixed task-owned QA schema only. The outer transaction always rolls back every test receipt.
  try{await db.transaction(async tx=>{
   await tx.query('SET LOCAL search_path TO growth_vnext_qa_c7e9190,public');
   const isolated={query:tx.query.bind(tx),transaction:async <T>(work:(client:typeof tx)=>Promise<T>)=>work(tx),close:async()=>{}};
   const id=(await tx.query("SELECT id FROM growth_content_items WHERE content_pack->>'assetModel'='MASTER_V1' AND current_rank=1")).rows[0]?.id;
   const item=await readGrowthItem(tx,id);if(!item)throw Error('QA_ITEM_MISSING');
   const asset=item.canonicalAssets!.find(a=>a.kind==='MASTER_VIDEO')!;
   for(const channel of ['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS'] as const){
    await markGrowthPosted(isolated,{itemId:id,channel,sha256:asset.sha256,creativeVersion:item.creativeVersion!},'qa-only');
    if(channel==='TIKTOK'){
     const fresh=await readGrowthItem(tx,id);if(fresh!.channels.find(c=>c.channel==='INSTAGRAM_REELS')?.status!=='DRAFT')throw Error('PLATFORM_STATE_COUPLED');
     try{await markGrowthPosted(isolated,{itemId:id,channel,sha256:asset.sha256,creativeVersion:item.creativeVersion!},'qa-only');throw Error('DUPLICATE_ALLOWED');}catch(e){if((e as Error).message!=='ALREADY_POSTED')throw e;}
    }
   }
   const receipts=(await tx.query('SELECT channel,canonical_asset_id,asset_sha256,snapshot FROM growth_manual_posts WHERE content_item_id=$1',[id])).rows;
   if(receipts.length!==3||new Set(receipts.map(r=>r.canonical_asset_id)).size!==1||new Set(receipts.map(r=>r.snapshot.utmSource)).size!==3)throw Error('RECEIPT_LINKAGE_FAILED');
   console.log(JSON.stringify({receipts:3,sharedAsset:true,independentStates:true,distinctSources:true,duplicateRejected:true,mode:'ROLLBACK_ONLY'}));throw Error('QA_ROLLBACK');
  });}catch(e){if((e as Error).message!=='QA_ROLLBACK')throw e;}
 }else if(command==='quota'){
  if(!process.env.ELEVENLABS_API_KEY)throw Error('VOICE_NOT_CONFIGURED');
  const response=await fetch('https://api.elevenlabs.io/v1/user/subscription',{headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY}});
  const value=await response.json();console.log(JSON.stringify({status:response.status,reason:value.detail?.status,tier:value.tier,used:value.character_count,limit:value.character_limit,remaining:value.character_limit-value.character_count}));
 }else if(command==='migration-check'){
  const sql=(await readFile(join(process.cwd(),'db/migrations/048_growth_canonical_assets.sql'),'utf8')).replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
  try{await db.transaction(async tx=>{
   await tx.query("SET LOCAL lock_timeout='3s'");await tx.query(sql);
   const item=(await tx.query('SELECT id FROM growth_content_items ORDER BY created_at DESC LIMIT 1')).rows[0];
   for(const kind of ['MASTER_VIDEO','STORY_IMAGE','FEED_IMAGE'])await tx.query('INSERT INTO growth_canonical_assets(content_item_id,kind,creative_version,mime_type,width,height,sha256,byte_length,asset_data) VALUES($1,$2,$3,$4,1080,$5,$6,4,$7)',[item.id,kind,'ROLLBACK_QA',kind==='MASTER_VIDEO'?'video/mp4':'image/png',kind==='FEED_IMAGE'?1350:1920,'a'.repeat(64),Buffer.from('test')]);
   await tx.query('SAVEPOINT duplicate_check');let rejected=false;
   try{await tx.query("INSERT INTO growth_canonical_assets SELECT gen_random_uuid(),content_item_id,kind,creative_version,mime_type,width,height,sha256,byte_length,asset_data,render_metadata,generated_at FROM growth_canonical_assets WHERE content_item_id=$1 LIMIT 1",[item.id]);}catch(error){if((error as {code:string}).code!=='23505')throw error;rejected=true;}
   await tx.query('ROLLBACK TO SAVEPOINT duplicate_check');if(!rejected)throw Error('DUPLICATE_NOT_REJECTED');
   console.log(JSON.stringify({migration:'048',threeKinds:true,duplicateRejected:true,mode:'ROLLBACK_ONLY'}));throw Error('QA_ROLLBACK');
  });}catch(error){if((error as Error).message!=='QA_ROLLBACK')throw error;}
  console.log(JSON.stringify({committed:false,tableExists:(await db.query("SELECT to_regclass('growth_canonical_assets') AS name")).rows[0].name}));
 }else if(command==='migrate'){
  const filename='048_growth_canonical_assets.sql',sql=(await readFile(join(process.cwd(),'db/migrations',filename),'utf8')).replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
  await db.transaction(async tx=>{await tx.query("SELECT pg_advisory_xact_lock(hashtext('growth-master-migration-048'))");if((await tx.query('SELECT filename FROM schema_migrations WHERE filename=$1',[filename])).rowCount)return;await tx.query(sql);await tx.query('INSERT INTO schema_migrations(filename) VALUES($1)',[filename]);});console.log('MIGRATION_048_APPLIED_OR_PRESENT');
 }else if(command==='audit'){
  const dashboard=await readGrowthDashboard(db);
  console.log(JSON.stringify({top10:dashboard.content.map((r,i)=>({rank:i+1,id:r.signals.fixtureId,match:r.signals.home.name+' x '+r.signals.away.name,competition:r.signals.competitionName,kickoff:r.signals.kickoff,score:r.priority.total})),items:dashboard.items.slice(0,10).map(i=>({id:i.id,fixture:i.fixtureId,version:i.creativeVersion,revision:i.revision,assets:i.platformAssets?.map(a=>({channel:a.channel,bytes:a.byteLength,metadata:a.renderMetadata}))}))}));
  if(process.env.ELEVENLABS_API_KEY){const r=await fetch('https://api.elevenlabs.io/v1/user/subscription',{headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY}});const j=await r.json();console.log(JSON.stringify({quotaHttp:r.status,tier:j.tier,used:j.character_count,limit:j.character_limit,nextReset:j.next_character_count_reset_unix}));}
 }else if(command==='run'){console.log(JSON.stringify(await runGrowthGeneration(db,'OWNER')));
 }else if(command==='render'){
  const ranked=await rankGrowthInventory(db),short=buildShortlist(ranked.map(r=>r.priority)),top=await enrichGrowthStorySignals(db,short.content.flatMap(p=>ranked.filter(r=>r.signals.fixtureId===p.fixtureId)));
  const index=Number(process.argv[3]??0),row=top[index];if(!row)throw Error('FIXTURE_MISSING');
  const material=generatedContent(row,index+1,top.slice(0,5));await mkdir(out,{recursive:true});
  const fps=Number(process.argv[4]??15),provider=new ElevenLabsVoiceProvider();
  // Explicit --synthesize is required for any paid cache miss; benchmarks default to cache-only.
  if(!process.argv.includes('--synthesize')){provider.available=()=>true;provider.synthesize=async()=>{throw Error('QA_CACHE_MISS_NO_SYNTHESIS');};}
  const video=await renderGrowthVideo(material.content.masterSocial!,material.fixture,{master:true,requireNarration:true,fps,voiceStore:databaseVoiceStore(db),voice:provider,deadlineMs:Date.now()+240_000});
  const file=join(out,`${row.signals.publicId}-${fps}.mp4`);await writeFile(file,video.data);
  const images=await renderCanonicalStatics(material.content.masterSocial!,material.fixture);
  for(const image of images)await writeFile(join(out,`${row.signals.publicId}-${image.kind}.png`),image.data);
  const report={file,fixture:material.fixture,metadata:video.renderMetadata,bytes:video.byteLength,memory:process.resourceUsage().maxRSS,images:images.map(i=>({kind:i.kind,bytes:i.byteLength,width:i.width,height:i.height}))};
  await writeFile(join(out,`${row.signals.publicId}-${fps}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }else if(command==='export-old'){
  const d=await readGrowthDashboard(db),item=d.items.find(i=>i.fixtureId===d.social[0]?.signals.fixtureId);if(!item)throw Error('NO_OLD_ITEM');
  const video=await readGrowthVideo(db,item.id,'INSTAGRAM_REELS');if(!video)throw Error('NO_OLD_VIDEO');await mkdir(out,{recursive:true});await writeFile(join(out,'old.mp4'),video.data);console.log(JSON.stringify({file:join(out,'old.mp4'),metadata:video.renderMetadata}));
 }else throw Error('UNKNOWN_COMMAND');
}finally{await db.close();}
