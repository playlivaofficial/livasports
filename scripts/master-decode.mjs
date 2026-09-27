// Decode existing local media only. No synthesis, network or production writes.
import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import ffmpeg from 'ffmpeg-static';
import {dirname,basename,join} from 'node:path';
const file=process.argv[2];if(!file)throw Error('VIDEO_REQUIRED');
const decode=spawnSync(ffmpeg,['-hide_banner','-i',file,'-map','0:v','-f','framemd5','-'],{encoding:'utf8',maxBuffer:8_000_000});
if(decode.status)throw Error('DECODE_FAILED');
const frames=decode.stdout.split('\n').filter(l=>/^0,/.test(l)).map(l=>l.split(',').map(s=>s.trim()));
const deltas=frames.slice(1).map((r,i)=>Number(r[2])-Number(frames[i][2]));
const repeated=frames.slice(1).filter((r,i)=>r[5]===frames[i][5]).length;
const metadata=JSON.parse(await readFile(file.replace(/\.mp4$/,'.json'),'utf8')).metadata;
for(const [index,scene] of metadata.sceneTiming.entries()){
 const result=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-ss',String(scene.startSeconds+.5),'-i',file,'-frames:v','1','-update','1','-y',join(dirname(file),`${basename(file,'.mp4')}-scene${index+1}.png`)]);
 if(result.status)throw Error('FRAME_FAILED');
}
const result={file,frames:frames.length,timebase:decode.stdout.split('\n').find(l=>l.startsWith('#tb')),ptsDeltas:[...new Set(deltas)],repeatedDecodedFrames:repeated,codec:decode.stderr.split('\n').filter(l=>l.includes('Stream #')),voice:metadata.voice,sceneTiming:metadata.sceneTiming};
await writeFile(file.replace(/\.mp4$/,'.decode.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
