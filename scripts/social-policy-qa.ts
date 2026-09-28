/** One read-only canary; no production writes, publishing, or sports-provider calls. */
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {resolve,join} from 'node:path';
import sharp from 'sharp';
import {PostgresDatabaseClient} from '../src/database/client';
import {rankGrowthInventory} from '../src/growth/service';
import {enrichGrowthStorySignals} from '../src/growth/repository';
import {generatedContent} from '../src/growth/content';
import {socialFrames,svgText,renderSocialPackage} from '../src/growth/social-renderer';
import {renderCanonicalStatics} from '../src/growth/canonical-renderer';
import {draftCompliance,SOCIAL_LABELS} from '../src/growth/socialCompliance';
import {VIDEO_CHANNELS} from '../src/growth/config';
import {voiceProvider,type VoiceClip,type VoiceClipStore} from '../src/growth/voice';
import {spokenLine} from '../src/growth/spoken';
const envPath=process.argv[2];if(!envPath)throw Error('PRIVATE_ENV_PATH_REQUIRED');
const narrated=process.argv.includes('--narrated'),root=resolve('output/social-policy/master');
let queries=0,voiceRequests=0;
const exists=(p:string)=>access(p).then(()=>true,()=>false);
await mkdir(join(root,'voice-cache'),{recursive:true});
try{
  if(narrated&&await exists(join(root,'master_video.mp4')))throw Error('SAMPLE_ALREADY_RENDERED_REVIEW_EXISTING');
  let material:ReturnType<typeof generatedContent>;
  if(await exists(join(root,'material.json')))material=JSON.parse(await readFile(join(root,'material.json'),'utf8'));
  else{
    const env=parseEnv(await readFile(resolve(envPath),'utf8'));
    if(!env.DATABASE_URL)throw Error('DATABASE_NOT_CONFIGURED');
    const db=new PostgresDatabaseClient(env.DATABASE_URL,()=>{queries++;},{statementTimeoutMs:30_000});
    try{
      const now=new Date(),inventory=await rankGrowthInventory(db,now);
      const chosen=inventory.find(r=>r.signals.fixtureId==='4f0d5109-2b7a-4e15-9b8b-06eef94b52e0');
      if(!chosen)throw Error('APPROVED_FIXTURE_NOT_AVAILABLE');
      const [row]=await enrichGrowthStorySignals(db,[chosen]);
      material=generatedContent(row,1,[row],now);
      await writeFile(join(root,'material.json'),JSON.stringify(material,null,2));
    }finally{await db.close();}
  }
  const drafts=material.content.platforms!,master=material.content.masterSocial!;
  const frames=await socialFrames(master,material.fixture),panels=[];
  for(const [i,svg] of frames.entries()){
    const png=await sharp(Buffer.from(svg)).png().toBuffer();await writeFile(join(root,'scene-'+(i+1)+'.png'),png);
    panels.push({input:await sharp(png).resize(270,480).toBuffer(),left:i*270,top:0});
  }
  await sharp({create:{width:frames.length*270,height:480,channels:3,background:'#041218'}}).composite(panels).png().toFile(join(root,'storyboard.png'));
  const requested=master.scenes.map((s,i)=>({order:s.order,text:spokenLine(s.voiceover,{mode:'EDITORIAL',hook:i===0})}));
  await writeFile(join(root,'approved-narration.json'),JSON.stringify(requested,null,2));
  if(narrated){
    // Read only the already configured narration key. No full env export, logging or persistence.
    if(process.argv.includes('--vercel-voice')){
      const auth=JSON.parse(await readFile(join(process.env.APPDATA!,'com.vercel.cli/Data/auth.json'),'utf8'));
      const response=await fetch('https://api.vercel.com/v1/projects/prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr/env/zxN3vQMvIsMNeVpX?teamId=team_rtsOqa3gRkQZwndpkXwyMDno',{headers:{Authorization:'Bearer '+auth.token}});
      if(!response.ok)throw Error('VOICE_CONFIG_HTTP_'+response.status);
      const value=await response.json();if(value.key!=='ELEVENLABS_API_KEY'||!value.decrypted||!value.value)throw Error('VOICE_CONFIG_UNAVAILABLE');
      process.env.ELEVENLABS_API_KEY=value.value;
    }else{
      const env=parseEnv(await readFile(resolve(envPath),'utf8'));
      for(const name of ['ELEVENLABS_API_KEY','ELEVENLABS_VOICE_ENERGETIC','ELEVENLABS_VOICE_EDITORIAL'])if(env[name])process.env[name]=env[name];
    }
  }
  const voice=voiceProvider(),store:VoiceClipStore={
    async get(key){try{const meta=JSON.parse(await readFile(join(root,'voice-cache',key+'.json'),'utf8'));return {...meta,data:await readFile(join(root,'voice-cache',key+'.mp3'))} as VoiceClip;}catch{return null;}},
    async put(key,clip,meta){await writeFile(join(root,'voice-cache',key+'.mp3'),clip.data);await writeFile(join(root,'voice-cache',key+'.json'),JSON.stringify({...meta,mimeType:clip.mimeType,sha256:clip.sha256},null,2));},
  };
  if(narrated&&!voice.available())throw Error('NARRATION_NOT_CONFIGURED');
  const boundedVoice={id:voice.id,available:()=>voice.available(),voiceFor:voice.voiceFor?.bind(voice),synthesize:async(...args:Parameters<typeof voice.synthesize>)=>{
    if(voiceRequests>=master.scenes.length)throw Error('QA_VOICE_REQUEST_CAP');voiceRequests++;return voice.synthesize(...args);
  }};
  const assets=narrated?await renderSocialPackage(drafts,material.fixture,{voice:boundedVoice,voiceStore:store,deadlineMs:Date.now()+250_000}):await renderCanonicalStatics(master,material.fixture);
  for(const asset of assets)await writeFile(join(root,asset.kind.toLowerCase()+(asset.mimeType==='video/mp4'?'.mp4':'.png')),asset.data);
  const video=assets.find(a=>a.kind==='MASTER_VIDEO');
  const report={generatedAt:new Date().toISOString(),sourceFixtureId:material.fixture.fixtureId,databaseQueries:queries,sportsProviderRequests:0,voiceRequests,productionWrites:0,productionDeployment:false,
    architecture:{masterVideos:video?1:0,storyImages:1,feedImages:1,postingProfiles:3},narratedQa:'PENDING_ACTUAL_MEDIA_REVIEW',
    assets:assets.map(asset=>({kind:asset.kind,sha256:asset.sha256,width:asset.width,height:asset.height,byteLength:asset.byteLength,renderMetadata:asset.renderMetadata})),approvedNarration:requested,
    exports:VIDEO_CHANNELS.map(channel=>({channel,label:SOCIAL_LABELS[channel],caption:drafts[channel].caption,hashtags:drafts[channel].hashtags,cta:drafts[channel].cta,
      videoSha256:video?.sha256??null,compliance:draftCompliance(drafts[channel],frames.map(svgText)),automaticChecksArePlatformApproval:false}))};
  await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));
  console.info(JSON.stringify({architecture:report.architecture,databaseQueries:queries,voiceRequests,narratedQa:report.narratedQa}));
}catch(error){console.error(JSON.stringify({error:error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'SOCIAL_SAMPLE_FAILED',databaseQueries:queries,voiceRequests}));process.exitCode=1;}
finally{delete process.env.ELEVENLABS_API_KEY;}
