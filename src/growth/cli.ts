import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import type {GrowthVideoChannel} from './config';
import {rankGrowthInventory,regenerateRightsFallbackDrafts,regenerateV1Drafts} from './service';
import {buildShortlist} from './shortlist';
import {generatedContent} from './content';
import {renderGrowthVideos} from './video-renderer';

const command=process.argv[2]??'verify',url=databaseUrl();
if(!url)throw new Error('GROWTH_DATABASE_UNAVAILABLE');
const db=new PostgresDatabaseClient(url,()=>undefined,{statementTimeoutMs:300_000});

function ffmpeg(args:string[]){return new Promise<void>((resolve,reject)=>{if(!ffmpegPath)return reject(new Error('FFMPEG_UNAVAILABLE'));
  const child=spawn(ffmpegPath,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-4000);});
  child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(`FFMPEG_${code}:${stderr}`)));});}

interface QaVideo {rank:number;channel:GrowthVideoChannel;file:string;}
async function createContactSheets(directory:string,videos:QaVideo[]){
  const framesDirectory=join(directory,'frames');await mkdir(framesDirectory,{recursive:true});
  const moments:Record<'hook'|'context'|'cta',Record<GrowthVideoChannel,number>>={
    hook:{TIKTOK:1,INSTAGRAM_REELS:1,YOUTUBE_SHORTS:1},
    context:{TIKTOK:8,INSTAGRAM_REELS:11,YOUTUBE_SHORTS:11},
    cta:{TIKTOK:18,INSTAGRAM_REELS:22,YOUTUBE_SHORTS:22},
  },channels:GrowthVideoChannel[]=['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS'],contactSheets:Record<string,string>={};
  for(const phase of Object.keys(moments) as Array<keyof typeof moments>){
    const panels:Array<{input:string|Buffer;left:number;top:number}>=[];
    for(const video of videos){const column=channels.indexOf(video.channel),frame=join(framesDirectory,`${phase}-${video.rank}-${video.channel.toLowerCase()}.png`);
      await ffmpeg(['-hide_banner','-loglevel','error','-ss',String(moments[phase][video.channel]),'-i',video.file,'-frames:v','1','-vf','scale=270:480','-y',frame]);
      const label=Buffer.from(`<svg width="270" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="270" height="40" fill="#06131c"/><text x="12" y="27" fill="#f7fbff" font-family="Arial" font-size="20" font-weight="800">R${video.rank} · ${video.channel.replace('_',' ')}</text></svg>`);
      panels.push({input:label,left:column*270,top:(video.rank-1)*520},{input:frame,left:column*270,top:(video.rank-1)*520+40});
    }
    const sheet=join(directory,`${phase}-contact-sheet.png`);await sharp({create:{width:810,height:2600,channels:4,background:'#06131c'}}).composite(panels).png().toFile(sheet);contactSheets[phase]=sheet;
  }
  return contactSheets;
}
try{
  if(command==='regenerate-rights-fallbacks')console.info(JSON.stringify({command,...await regenerateRightsFallbackDrafts(db)},null,2));
  else if(command==='regenerate-v1-drafts')console.info(JSON.stringify({command,...await regenerateV1Drafts(db)},null,2));
  else if(command==='validate-migration'){
    const source=await readFile(new URL('../../db/migrations/036_traffic_engine_v1_1.sql',import.meta.url),'utf8'),dryRun=source.replace(/COMMIT;\s*$/,'ROLLBACK;');
    if(dryRun===source)throw new Error('MIGRATION_COMMIT_NOT_FOUND');await db.query(dryRun);
    const committed=(await db.query<{committed:boolean}>(`SELECT to_regclass('public.growth_platform_assets') IS NOT NULL AS committed`)).rows[0]?.committed??false;
    console.info(JSON.stringify({command,file:'036_traffic_engine_v1_1.sql',validated:true,committed},null,2));
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
  else if(command==='render-top5'){
    const ranked=await rankGrowthInventory(db),shortlist=buildShortlist(ranked.map(row=>row.priority)),byId=new Map(ranked.map(row=>[row.signals.fixtureId,row]));
    const top=shortlist.social.flatMap(priority=>{const row=byId.get(priority.fixtureId);return row?[row]:[]}),directory=await mkdtemp(join(tmpdir(),'livasports-v11-qa-')),manifest:Record<string,unknown>[]=[],qaVideos:QaVideo[]=[];
    for(const [index,row] of top.entries()){
      const material=generatedContent(row,index+1,top),videos=await renderGrowthVideos(material.content.platforms!,material.fixture);
      for(const video of videos)if(video.status==='READY'){const file=join(directory,`${index+1}-${row.signals.publicId}-${video.channel.toLowerCase()}.mp4`);await writeFile(file,video.data);qaVideos.push({rank:index+1,channel:video.channel,file});
        manifest.push({rank:index+1,fixtureId:row.signals.fixtureId,publicId:row.signals.publicId,competition:row.signals.competitionName,home:row.signals.home.name,away:row.signals.away.name,channel:video.channel,file,sha256:video.sha256,bytes:video.byteLength,story:material.content.story});}
      else manifest.push({rank:index+1,fixtureId:row.signals.fixtureId,channel:video.channel,status:'FAILED',errorCode:video.errorCode});
    }
    const manifestFile=join(directory,'manifest.json'),contactSheets=await createContactSheets(directory,qaVideos);await writeFile(manifestFile,JSON.stringify(manifest,null,2));console.info(JSON.stringify({command,directory,manifestFile,contactSheets,outputs:manifest.length},null,2));
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
