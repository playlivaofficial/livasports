import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import type {GrowthVideoChannel} from './config';
import {rankGrowthInventory,regenerateRightsFallbackDrafts,regenerateV1Drafts,regeneratePremiumDrafts} from './service';
import {enrichGrowthStorySignals,readLatestGrowthItems,readGrowthVideo} from './repository';
import {buildShortlist} from './shortlist';
import {generatedContent} from './content';
import {renderGrowthVideos,growthSceneSvg} from './video-renderer';
import type {GrowthRenderMetadata} from './types';
import {newOwnerSession,ownerCookie,signOwnerSession} from '@/owner/session';

const command=process.argv[2]??'verify',url=databaseUrl();
if(!url)throw new Error('GROWTH_DATABASE_UNAVAILABLE');
const db=new PostgresDatabaseClient(url,()=>undefined,{statementTimeoutMs:300_000});

function ffmpeg(args:string[]){return new Promise<void>((resolve,reject)=>{if(!ffmpegPath)return reject(new Error('FFMPEG_UNAVAILABLE'));
  const child=spawn(ffmpegPath,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-4000);});
  child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(`FFMPEG_${code}:${stderr}`)));});}

interface QaVideo {rank:number;channel:GrowthVideoChannel;file:string;metadata?:GrowthRenderMetadata;visuals?:string[];}
async function createContactSheets(directory:string,videos:QaVideo[]){
  const framesDirectory=join(directory,'frames');await mkdir(framesDirectory,{recursive:true});
  const moments:Record<'hook'|'matchup'|'context'|'cta',Record<GrowthVideoChannel,number>>={
    hook:{TIKTOK:1,INSTAGRAM_REELS:1,YOUTUBE_SHORTS:1},
    matchup:{TIKTOK:5,INSTAGRAM_REELS:6,YOUTUBE_SHORTS:5},
    context:{TIKTOK:8,INSTAGRAM_REELS:11,YOUTUBE_SHORTS:11},
    cta:{TIKTOK:18,INSTAGRAM_REELS:22,YOUTUBE_SHORTS:22},
  },channels:GrowthVideoChannel[]=['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS'],contactSheets:Record<string,string>={};
  for(const phase of Object.keys(moments) as Array<keyof typeof moments>){
    const panels:Array<{input:string|Buffer;left:number;top:number}>=[];
    for(const video of videos){const column=channels.indexOf(video.channel),frame=join(framesDirectory,`${phase}-${video.rank}-${video.channel.toLowerCase()}.png`);
      const visual=phase==='hook'?'HOOK':phase==='matchup'?'MATCHUP':phase==='context'?'CONTEXT':'CTA';
      const found=video.visuals?.findIndex(value=>value===visual)??-1;
      const timing=video.metadata?.sceneTiming[found>=0?found:phase==='hook'?0:phase==='matchup'?1:phase==='context'?2:4];
      await ffmpeg(['-hide_banner','-loglevel','error','-ss',String(timing?timing.startSeconds+Math.min(1,timing.durationSeconds/2):moments[phase][video.channel]),'-i',video.file,'-frames:v','1','-vf','scale=270:480','-y',frame]);
      const label=Buffer.from(`<svg width="270" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="270" height="40" fill="#06131c"/><text x="12" y="27" fill="#f7fbff" font-family="Arial" font-size="20" font-weight="800">R${video.rank} · ${video.channel.replace('_',' ')}</text></svg>`);
      panels.push({input:label,left:column*270,top:(video.rank-1)*520},{input:frame,left:column*270,top:(video.rank-1)*520+40});
    }
    const sheet=join(directory,`${phase}-contact-sheet.png`);await sharp({create:{width:810,height:2600,channels:4,background:'#06131c'}}).composite(panels).png().toFile(sheet);contactSheets[phase]=sheet;
  }
  return contactSheets;
}
try{
  if(command==='regenerate-rights-fallbacks')console.info(JSON.stringify({command,...await regenerateRightsFallbackDrafts(db)},null,2));
  else if(command==='regenerate-premium-drafts')console.info(JSON.stringify({command,...await regeneratePremiumDrafts(db)},null,2));
  else if(command==='regenerate-v1-drafts')console.info(JSON.stringify({command,...await regenerateV1Drafts(db)},null,2));
  else if(command==='apply-premium-migration'){
    const filename='037_growth_premium_creative.sql';
    const applied=(await db.query<{filename:string}>('SELECT filename FROM schema_migrations')).rows.map(row=>row.filename);
    if(!applied.includes('036_traffic_engine_v1_1.sql'))throw new Error('V11_MIGRATION_REQUIRED');
    if(!applied.includes(filename))await db.transaction(async tx=>{
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('growth-premium-migration',0))");
      if((await tx.query('SELECT 1 FROM schema_migrations WHERE filename=$1',[filename])).rowCount)return;
      const source=await readFile(new URL(`../../db/migrations/${filename}`,import.meta.url),'utf8');
      await tx.query(source.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
      await tx.query('INSERT INTO schema_migrations(filename) VALUES($1)',[filename]);
    });
    console.info(JSON.stringify({command,filename,applied:true,alreadyApplied:applied.includes(filename)}));
  }
  else if(command==='deployed-preview'){
    const origin=new URL(process.argv[3]??'');
    if(origin.protocol!=='https:'||!(origin.hostname==='livasports.com'||/^livasports-[a-z0-9-]+\.vercel\.app$/.test(origin.hostname)))throw new Error('INVALID_DEPLOYMENT_ORIGIN');
    const ranked=await rankGrowthInventory(db),top=buildShortlist(ranked.map(row=>row.priority)).social;
    const directory=await mkdtemp(join(tmpdir(),'livasports-deployed-qa-'));
    const cookie=`${ownerCookie}=${signOwnerSession(newOwnerSession())}`;
    for(const channel of ['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS']){
      const response=await fetch(new URL('/api/owner/growth',origin),{method:'POST',headers:{cookie,origin:origin.origin,'sec-fetch-site':'same-origin','content-type':'application/json',
        ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET?{'x-vercel-protection-bypass':process.env.VERCEL_AUTOMATION_BYPASS_SECRET}:{})},
        body:JSON.stringify({action:'preview',fixtureId:top[0].fixtureId,channel}),signal:AbortSignal.timeout(180_000)});
      if(!response.ok||!response.headers.get('content-type')?.includes('video/mp4'))throw new Error(`DEPLOYED_PREVIEW_HTTP_${response.status}`);
      const data=Buffer.from(await response.arrayBuffer()),file=join(directory,`${channel.toLowerCase()}.mp4`);await writeFile(file,data);
      console.info(JSON.stringify({command,origin:origin.origin,channel,file,bytes:data.length,voice:response.headers.get('x-growth-voice'),characters:response.headers.get('x-growth-characters'),renderMs:response.headers.get('x-growth-render-ms')}));
    }
  }
  else if(command==='download-live-top5'){
    const ranked=await rankGrowthInventory(db),top=buildShortlist(ranked.map(row=>row.priority)).social;
    const items=await readLatestGrowthItems(db),directory=await mkdtemp(join(tmpdir(),'livasports-production-proof-'));
    const videos:QaVideo[]=[],manifest=[];
    for(const [index,priority] of top.entries()){
      const item=items.find(row=>row.fixtureId===priority.fixtureId);
      if(!item||item.content.platforms?.TIKTOK.creative?.version!=='PREMIUM_1')throw new Error('PREMIUM_TOP5_INCOMPLETE');
      for(const channel of ['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS'] as const){
        const video=await readGrowthVideo(db,item.id,channel);
        if(!video?.renderMetadata||video.renderMetadata.voice.degradedReason)throw new Error('PRODUCTION_VIDEO_INCOMPLETE');
        const file=join(directory,`${index+1}-${item.fixture.publicId}-${channel.toLowerCase()}.mp4`);
        await writeFile(file,video.data);
        videos.push({rank:index+1,channel,file,metadata:video.renderMetadata,visuals:item.content.platforms![channel].scenes.map(scene=>scene.visual)});
        manifest.push({rank:index+1,itemId:item.id,revision:item.revision,supersedesItemId:item.supersedesItemId,fixture:item.fixture,channel,file,bytes:video.byteLength,sha256:video.sha256,metadata:video.renderMetadata,creative:item.content.platforms![channel].creative,tracking:item.channels.find(row=>row.channel===channel)});
      }
    }
    await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
    console.info(JSON.stringify({command,directory,outputs:videos.length,contactSheets:await createContactSheets(directory,videos)},null,2));
  }
  else if(command==='verify-premium'){
    const migration=(await db.query(`SELECT 1 FROM schema_migrations WHERE filename='037_growth_premium_creative.sql'`)).rowCount===1;
    const states=(await db.query(`SELECT ch.status,count(*)::int AS count FROM growth_content_channels ch GROUP BY ch.status ORDER BY ch.status`)).rows;
    const drafts=(await db.query(`SELECT i.id,i.fixture_id,i.revision,f.kickoff,i.content_pack#>>'{platforms,TIKTOK,creative,version}' AS creative_version
      FROM growth_content_items i JOIN fixtures f ON f.id=i.fixture_id WHERE i.superseded_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM growth_content_channels ch WHERE ch.content_item_id=i.id AND ch.status<>'DRAFT') ORDER BY f.kickoff DESC,i.revision DESC`)).rows;
    const jobs=(await db.query(`SELECT id,trigger_source,status,started_at,finished_at,summary,error_code FROM growth_generation_jobs ORDER BY started_at DESC LIMIT 6`).catch(async()=>db.query(`SELECT * FROM growth_generation_jobs ORDER BY started_at DESC LIMIT 6`))).rows;
    console.info(JSON.stringify({command,migration037:migration,states,drafts,jobs},null,2));
  }
  else if(command==='validate-migration'||command==='validate-premium-migration'){
    const filename=command==='validate-premium-migration'?'037_growth_premium_creative.sql':'036_traffic_engine_v1_1.sql';
    const source=await readFile(new URL(`../../db/migrations/${filename}`,import.meta.url),'utf8'),dryRun=source.replace(/COMMIT;\s*$/,'ROLLBACK;');
    if(dryRun===source)throw new Error('MIGRATION_COMMIT_NOT_FOUND');await db.query(dryRun);
    const committed=(await db.query<{committed:boolean}>(`SELECT to_regclass('public.growth_platform_assets') IS NOT NULL AS committed`)).rows[0]?.committed??false;
    console.info(JSON.stringify({command,file:filename,validated:true,transaction:'ROLLED_BACK',existingV11Table:committed},null,2));
  }
  else if(command==='audit-media'){
    const state=(await db.query<{rightsTable:string|null;providerPlayerPhotos:number}>(`SELECT to_regclass('public.growth_media_rights')::text AS "rightsTable",
      (SELECT count(*)::int FROM players WHERE image_url IS NOT NULL) AS "providerPlayerPhotos"`)).rows[0]!;
    const approvedCommercialAssets=state.rightsTable?(await db.query<{count:number}>(`SELECT count(*)::int AS count FROM growth_media_rights
      WHERE license_status='APPROVED' AND commercial_eligible AND (valid_from IS NULL OR valid_from<=now()) AND (valid_until IS NULL OR valid_until>now())`)).rows[0]?.count??0:0;
    console.info(JSON.stringify({command,...state,approvedCommercialAssets,decision:approvedCommercialAssets>0?'PLAYER_MEDIA_ENABLED':'PLAYER_TEMPLATES_DORMANT_RIGHTS_SAFE_FALLBACK'},null,2));
  }
  else if(command==='audit-top10'){
    const ranked=await rankGrowthInventory(db),shortlist=buildShortlist(ranked.map(row=>row.priority)),byId=new Map(ranked.map(row=>[row.signals.fixtureId,row]));
    const selected=shortlist.content.flatMap(priority=>{const row=byId.get(priority.fixtureId);return row?[row]:[]}),ids=selected.map(row=>row.signals.fixtureId);
    const canonical=(await db.query<Record<string,unknown>>(`SELECT f.id AS fixture_id,f.public_id,f.kickoff,c.slug AS competition_slug,c.display_name_pt_br AS competition_name,
      ht.public_id AS home_public_id,ht.name AS home_name,at.public_id AS away_public_id,at.name AS away_name
      FROM fixtures f JOIN competitions c ON c.id=f.competition_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
      WHERE f.id=ANY($1::uuid[])`,[ids])).rows,sourceById=new Map(canonical.map(row=>[String(row.fixture_id),row]));
    const fixtures=selected.map((row,index)=>{const source=sourceById.get(row.signals.fixtureId),checks={fixture:!!source&&String(source.public_id)===row.signals.publicId,
      competition:!!source&&String(source.competition_slug)===row.signals.competitionSlug&&String(source.competition_name)===row.signals.competitionName,
      home:!!source&&String(source.home_public_id)===row.signals.home.publicId&&String(source.home_name)===row.signals.home.name,
      away:!!source&&String(source.away_public_id)===row.signals.away.publicId&&String(source.away_name)===row.signals.away.name,
      kickoff:!!source&&new Date(String(source.kickoff)).toISOString()===row.signals.kickoff};
      return {rank:index+1,fixtureId:row.signals.fixtureId,publicId:row.signals.publicId,competition:row.signals.competitionName,home:row.signals.home.name,away:row.signals.away.name,kickoff:row.signals.kickoff,canonicalPath:row.destinationPath,checks,verified:Object.values(checks).every(Boolean)};});
    const verified=fixtures.length===10&&fixtures.every(row=>row.verified);console.info(JSON.stringify({command,count:fixtures.length,verified,fixtures},null,2));if(!verified)throw new Error('TOP_10_CANONICAL_MISMATCH');
  }
  else if(command==='render-top5'||command==='render-frames'){
    const ranked=await rankGrowthInventory(db),shortlist=buildShortlist(ranked.map(row=>row.priority)),byId=new Map(ranked.map(row=>[row.signals.fixtureId,row]));
    const top=await enrichGrowthStorySignals(db,shortlist.social.flatMap(priority=>{const row=byId.get(priority.fixtureId);return row?[row]:[]})),directory=await mkdtemp(join(tmpdir(),'livasports-premium-qa-')),manifest:Record<string,unknown>[]=[],qaVideos:QaVideo[]=[];
    const started=Date.now();console.info(JSON.stringify({event:'qa-start',directory,count:top.length}));
    for(const [index,row] of top.entries()){
      const material=generatedContent(row,index+1,top);
      if(command==='render-frames'){
        for(const draft of Object.values(material.content.platforms!))for(const [phase,sceneIndex] of [['hook',0],['context',2],['cta',4]] as const){
          const file=join(directory,`${index+1}-${draft.channel}-${phase}.png`);
          const svg=await growthSceneSvg(draft.scenes[sceneIndex],material.fixture,draft);
          await sharp(Buffer.from(svg)).png().toFile(file);
        }
        manifest.push({rank:index+1,fixture:material.fixture,platforms:material.content.platforms});continue;
      }
      const videos=await renderGrowthVideos(material.content.platforms!,material.fixture);
      for(const video of videos)if(video.status==='READY'){const file=join(directory,`${index+1}-${row.signals.publicId}-${video.channel.toLowerCase()}.mp4`);await writeFile(file,video.data);qaVideos.push({rank:index+1,channel:video.channel,file});
        qaVideos[qaVideos.length-1].metadata=video.renderMetadata;
        qaVideos[qaVideos.length-1].visuals=material.content.platforms![video.channel].scenes.map(scene=>scene.visual);
        manifest.push({rank:index+1,fixtureId:row.signals.fixtureId,publicId:row.signals.publicId,competition:row.signals.competitionName,home:row.signals.home.name,away:row.signals.away.name,channel:video.channel,file,sha256:video.sha256,bytes:video.byteLength,story:material.content.story,creative:material.content.platforms![video.channel].creative,renderMetadata:video.renderMetadata,platform:material.content.platforms![video.channel]});}
      else manifest.push({rank:index+1,fixtureId:row.signals.fixtureId,channel:video.channel,status:'FAILED',errorCode:video.errorCode});
      console.info(JSON.stringify({event:'fixture-rendered',rank:index+1,statuses:videos.map(video=>({channel:video.channel,status:video.status,...(video.status==='FAILED'?{error:video.errorCode}:{voice:video.voice,renderMs:video.renderMetadata?.renderMs})}))}));
    }
    const manifestFile=join(directory,'manifest.json'),contactSheets=qaVideos.length?await createContactSheets(directory,qaVideos):{};
    await writeFile(manifestFile,JSON.stringify(manifest,null,2));console.info(JSON.stringify({command,directory,manifestFile,contactSheets,outputs:manifest.length,elapsedMs:Date.now()-started,nodePeakRssMb:Math.round(process.resourceUsage().maxRSS/1024)},null,2));
  }else if(command==='verify'){
    const migration=(await db.query<{applied:boolean}>(`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE filename='036_traffic_engine_v1_1.sql') AS applied`)).rows[0]?.applied??false;
    const summary=(await db.query<Record<string,string>>(`SELECT
      (SELECT count(*) FROM growth_seo_priorities WHERE active)::text AS active_seo,
      (SELECT count(*) FROM growth_seo_priorities WHERE active AND top_social)::text AS top_social,
      (SELECT count(*) FROM growth_content_items WHERE generator_version=2 AND superseded_at IS NULL)::text AS active_v11_items,
      (SELECT count(*) FROM growth_platform_assets WHERE status='READY')::text AS ready_videos,
      (SELECT count(*) FROM growth_platform_assets WHERE status='FAILED')::text AS failed_videos,
      (SELECT count(*) FROM growth_content_items i WHERE i.generator_version<2 AND i.superseded_at IS NULL AND NOT EXISTS(SELECT 1 FROM growth_content_channels ch WHERE ch.content_item_id=i.id AND ch.status<>'DRAFT'))::text AS remaining_v1_drafts`)).rows[0];
    const videos=(await db.query<Record<string,unknown>>(`SELECT a.content_item_id,a.channel,a.byte_length,a.sha256,i.fixture_id,i.revision
      FROM growth_platform_assets a JOIN growth_content_items i ON i.id=a.content_item_id WHERE a.status='READY' ORDER BY a.generated_at DESC,a.channel LIMIT 30`)).rows;
    const vercel=JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url),'utf8')) as {crons?:Array<{path:string;schedule:string}>};
    console.info(JSON.stringify({command,migration036:migration,summary,videos,scheduler:vercel.crons?.filter(cron=>cron.path==='/api/internal/growth-refresh')??[]},null,2));
  }else throw new Error('UNKNOWN_GROWTH_COMMAND');
}finally{await db.close();}
