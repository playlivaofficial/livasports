#!/usr/bin/env node
/**
 * LivaSports Premium Motion — original audio library generator.
 *
 * Every music bed, ambience loop and sound effect used by the growth renderer is synthesised here
 * from code: oscillators, filtered noise, Karplus–Strong strings and a small reverb. No samples, no
 * recordings, no third-party loops and no AI music service are involved, so the provenance of every
 * file is this script plus its fixed seed. The output is deterministic: running it again produces
 * byte-identical WAV intermediates and the same PROVENANCE.json hashes for the encoded files.
 *
 *   node scripts/growth-audio-generate.mjs            # writes public/growth/audio/v1/*
 *
 * Licence of the output: original work owned by LivaSports; cleared for commercial use on every
 * platform, including monetised TikTok, Instagram Reels and YouTube Shorts.
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const OUT=join(ROOT,'public/growth/audio/v1');
const FFMPEG=join(ROOT,'node_modules/ffmpeg-static/ffmpeg');
const SR=44100;
const GENERATOR_VERSION='liva-audio-synth-1';

// ---------------------------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------------------------
function rng(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
const stereo=(seconds)=>({L:new Float32Array(Math.ceil(seconds*SR)),R:new Float32Array(Math.ceil(seconds*SR))});
const midi=(note)=>440*Math.pow(2,(note-69)/12);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function add(buffer,signal,start,gain=1,pan=0){
  const s=Math.floor(start*SR),gl=Math.cos((pan+1)*Math.PI/4)*gain*Math.SQRT2,gr=Math.sin((pan+1)*Math.PI/4)*gain*Math.SQRT2;
  for(let i=0;i<signal.length;i++){const j=s+i;if(j<0||j>=buffer.L.length)continue;buffer.L[j]+=signal[i]*gl;buffer.R[j]+=signal[i]*gr;}
}
/** Exponential-ish attack/decay envelope, seconds. */
function envelope(length,attack,decay,sustain=0,release=0){
  const n=Math.floor(length*SR),out=new Float32Array(n),a=Math.max(1,attack*SR),d=Math.max(1,decay*SR),r=Math.max(1,release*SR);
  for(let i=0;i<n;i++){let v;if(i<a)v=i/a;else if(i<a+d)v=sustain+(1-sustain)*Math.exp(-5*(i-a)/d);else v=sustain;
    if(release&&i>n-r)v*=(n-i)/r;out[i]=v;}
  return out;
}
/** RBJ biquad; coefficients may be updated per block for sweeps. */
class Biquad{
  constructor(){this.x1=this.x2=this.y1=this.y2=0;this.set('lp',1000,.707);}
  set(type,freq,q){const w=2*Math.PI*clamp(freq,20,SR*.45)/SR,cos=Math.cos(w),alpha=Math.sin(w)/(2*q);let b0,b1,b2;
    if(type==='lp'){b0=(1-cos)/2;b1=1-cos;b2=(1-cos)/2;}else if(type==='hp'){b0=(1+cos)/2;b1=-(1+cos);b2=(1+cos)/2;}else{b0=alpha;b1=0;b2=-alpha;}
    const a0=1+alpha;this.b0=b0/a0;this.b1=b1/a0;this.b2=b2/a0;this.a1=-2*cos/a0;this.a2=(1-alpha)/a0;return this;}
  run(x){const y=this.b0*x+this.b1*this.x1+this.b2*this.x2-this.a1*this.y1-this.a2*this.y2;this.x2=this.x1;this.x1=x;this.y2=this.y1;this.y1=y;return y;}
}
function filter(signal,type,freq,q=.707){const f=new Biquad().set(type,freq,q);const out=new Float32Array(signal.length);for(let i=0;i<signal.length;i++)out[i]=f.run(signal[i]);return out;}
function sweep(signal,type,from,to,q=.9,curve=1){
  const f=new Biquad(),out=new Float32Array(signal.length);
  for(let i=0;i<signal.length;i++){if(i%32===0){const p=Math.pow(i/signal.length,curve);f.set(type,from*Math.pow(to/from,p),q);}out[i]=f.run(signal[i]);}
  return out;
}
function noise(seconds,random){const out=new Float32Array(Math.floor(seconds*SR));for(let i=0;i<out.length;i++)out[i]=random()*2-1;return out;}
function pinkNoise(seconds,random){const out=new Float32Array(Math.floor(seconds*SR));let b0=0,b1=0,b2=0;for(let i=0;i<out.length;i++){const w=random()*2-1;b0=.99765*b0+w*.099046;b1=.963*b1+w*.2965164;b2=.57*b2+w*1.0526913;out[i]=(b0+b1+b2+w*.1848)*.18;}return out;}
function mul(a,b){const out=new Float32Array(a.length);for(let i=0;i<a.length;i++)out[i]=a[i]*(b[i]??0);return out;}
function sine(freq,seconds,phase=0){const out=new Float32Array(Math.floor(seconds*SR));for(let i=0;i<out.length;i++)out[i]=Math.sin(phase+2*Math.PI*freq*i/SR);return out;}
/** Band-limited saw (polyBLEP) — no aliasing hiss on pads and bass. */
function saw(freq,seconds,detuneCents=0){const f=freq*Math.pow(2,detuneCents/1200),dt=f/SR,out=new Float32Array(Math.floor(seconds*SR));let p=(detuneCents*7919%1000)/1000;
  const blep=(t)=>t<dt?(t/=dt,t+t-t*t-1):t>1-dt?(t=(t-1)/dt,t*t+t+t+1):0;
  for(let i=0;i<out.length;i++){out[i]=2*p-1-blep(p);p+=dt;if(p>=1)p-=1;}return out;}
function softClip(buffer,drive=1){for(const ch of [buffer.L,buffer.R])for(let i=0;i<ch.length;i++)ch[i]=Math.tanh(ch[i]*drive)/Math.tanh(drive);}
/** Karplus–Strong plucked string: the most natural-sounding instrument available without samples. */
function pluck(freq,seconds,random,brightness=.5,decay=.996){
  const n=Math.floor(seconds*SR),period=Math.max(2,Math.round(SR/freq)),line=new Float32Array(period),out=new Float32Array(n);
  for(let i=0;i<period;i++)line[i]=(random()*2-1)*(1-brightness*.5);
  // Averaging weight: .5 is the classic (darkest) string, lower keeps more high harmonics ringing.
  const weight=.5-clamp(brightness,0,1)*.3;let idx=0;
  for(let i=0;i<n;i++){const a=line[idx],b=line[(idx+1)%period];out[i]=a;line[idx]=decay*((1-weight)*a+weight*b);idx=(idx+1)%period;}
  return out;
}
/** Small Schroeder/Freeverb-style room so dry synthesis sits in a space rather than in a box. */
function reverb(buffer,{mix=.22,size=.84,damp=.35}={}){
  const combs=[1116,1188,1277,1356,1422,1491],alls=[556,441];
  for(const [channelIndex,ch] of [buffer.L,buffer.R].entries()){
    const spread=channelIndex?23:0,wet=new Float32Array(ch.length);
    for(const base of combs){const len=base+spread,line=new Float32Array(len);let idx=0,store=0;
      for(let i=0;i<ch.length;i++){const out=line[idx];store=out*(1-damp)+store*damp;line[idx]=ch[i]*.015+store*size;wet[i]+=out;idx=(idx+1)%len;}}
    for(const base of alls){const len=base+spread,line=new Float32Array(len);let idx=0;
      for(let i=0;i<wet.length;i++){const buf=line[idx],input=wet[i];wet[i]=-input+buf;line[idx]=input+buf*.5;idx=(idx+1)%len;}}
    for(let i=0;i<ch.length;i++)ch[i]=ch[i]*(1-mix)+wet[i]*mix*3;
  }
}
/** Fold the release tail back onto the start so a bar-exact loop repeats without a seam. */
function foldLoop(buffer,loopSeconds){
  const n=Math.round(loopSeconds*SR),out=stereo(loopSeconds);
  for(const key of ['L','R'])for(let i=0;i<buffer[key].length;i++)out[key][i%n]+=buffer[key][i];
  return out;
}
function crossfadeLoop(buffer,fadeSeconds){
  const f=Math.floor(fadeSeconds*SR),n=buffer.L.length-f,out=stereo(n/SR);
  for(const key of ['L','R']){for(let i=0;i<n;i++)out[key][i]=buffer[key][i];for(let i=0;i<f;i++){const g=i/f;out[key][i]=buffer[key][i]*g+buffer[key][n+i]*(1-g);}}
  return out;
}
function normalizePeak(buffer,peak=.89){let max=0;for(const ch of [buffer.L,buffer.R])for(const v of ch)max=Math.max(max,Math.abs(v));const g=max?peak/max:1;for(const ch of [buffer.L,buffer.R])for(let i=0;i<ch.length;i++)ch[i]*=g;}
function wav(buffer){
  const n=buffer.L.length,data=Buffer.alloc(44+n*4);data.write('RIFF',0);data.writeUInt32LE(36+n*4,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);
  data.writeUInt32LE(SR,24);data.writeUInt32LE(SR*4,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(n*4,40);
  for(let i=0;i<n;i++){data.writeInt16LE(Math.round(clamp(buffer.L[i],-1,1)*32767),44+i*4);data.writeInt16LE(Math.round(clamp(buffer.R[i],-1,1)*32767),46+i*4);}
  return data;
}

// ---------------------------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------------------------
function kick(random,{pitch=52,punch=1,length=.42}={}){
  const n=Math.floor(length*SR),out=new Float32Array(n);let phase=0;
  for(let i=0;i<n;i++){const t=i/SR,f=pitch+170*punch*Math.exp(-t*38);phase+=2*Math.PI*f/SR;out[i]=Math.sin(phase)*Math.exp(-t*7.5)+(i<220?(random()*2-1)*.35*(1-i/220):0);}
  return out;
}
function clap(random,length=.28){const n=noise(length,random),e=new Float32Array(n.length);
  for(let i=0;i<e.length;i++){const t=i/SR;e[i]=(t<.03?[0,.011,.022].reduce((s,o)=>s+(t>=o?Math.exp(-(t-o)*190):0),0):0)+Math.exp(-t*20)*.8;}
  return filter(mul(filter(n,'bp',1350,1.2),e),'hp',500);}
function hat(random,open=false){const len=open?.32:.06,n=filter(noise(len,random),'hp',7200,.8),e=envelope(len,.001,open?.28:.035);return mul(n,e);}
function shaker(random){const n=filter(filter(noise(.09,random),'hp',5200),'lp',11000),e=envelope(.09,.012,.05);return mul(n,e);}
function tom(random,pitch=78,length=.9){const n=Math.floor(length*SR),out=new Float32Array(n);let phase=0;
  for(let i=0;i<n;i++){const t=i/SR,f=pitch+60*Math.exp(-t*14);phase+=2*Math.PI*f/SR;out[i]=Math.sin(phase)*Math.exp(-t*4.2)*.9+(i<900?(random()*2-1)*.25*Math.exp(-i/260):0);}
  return filter(out,'lp',2400);}
function subBass(note,length,glide=0){const f=midi(note),n=Math.floor(length*SR),out=new Float32Array(n);let phase=0;
  for(let i=0;i<n;i++){const t=i/SR;phase+=2*Math.PI*f*(1+glide*Math.exp(-t*30))/SR;const env=Math.min(1,t/.008)*Math.exp(-t*1.6);out[i]=Math.tanh(Math.sin(phase)*1.6)*env;}
  return out;}
function pad(notes,length,cutoff=1400,random){
  const out=new Float32Array(Math.floor(length*SR));
  for(const note of notes)for(const cents of [-9,-3,4,11]){const s=saw(midi(note),length,cents+(random()-.5)*2);for(let i=0;i<out.length;i++)out[i]+=s[i]*.06;}
  const env=envelope(length,Math.min(.9,length*.3),length,1,Math.min(1.2,length*.35));
  return sweep(mul(out,env),'lp',cutoff*.6,cutoff,.8,.6);
}
function stab(notes,length,cutoff=2600){const out=new Float32Array(Math.floor(length*SR));
  for(const note of notes)for(const cents of [-6,6]){const s=saw(midi(note),length,cents);for(let i=0;i<out.length;i++)out[i]+=s[i]*.09;}
  return sweep(mul(out,envelope(length,.004,length*.7)),'lp',cutoff,cutoff*.35,1.1);}
/** Soft electric-piano: two-operator FM with a quick bell decay. */
function keys(note,length){const f=midi(note),n=Math.floor(length*SR),out=new Float32Array(n);
  for(let i=0;i<n;i++){const t=i/SR,mod=Math.sin(2*Math.PI*f*2*t)*1.4*Math.exp(-t*6);out[i]=Math.sin(2*Math.PI*f*t+mod)*Math.exp(-t*2.2)*Math.min(1,t/.004)*.3;}
  return out;}
function stringOstinato(note,length){const out=new Float32Array(Math.floor(length*SR));
  for(const cents of [-7,0,7]){const s=saw(midi(note),length,cents);for(let i=0;i<out.length;i++)out[i]+=s[i]*.12;}
  return filter(mul(out,envelope(length,.012,length*.8)),'lp',1800,.9);}

// ---------------------------------------------------------------------------------------------
// Music beds — bar-exact, seamless loops
// ---------------------------------------------------------------------------------------------
function bed(id,bpm,bars,build){
  const beat=60/bpm,loop=beat*4*bars,buffer=stereo(loop+3);
  build(buffer,beat);
  reverb(buffer,{mix:.18});
  const looped=foldLoop(buffer,loop);softClip(looped,1.3);normalizePeak(looped,.89);
  return {id,buffer:looped,meta:{bpm,bars,loopSeconds:Math.round(loop*1000)/1000}};
}
const CHORDS={am:[57,60,64],f:[53,57,60],c:[48,52,55],g:[55,59,62],dm:[50,53,57],bb:[46,50,53],em:[52,55,59],fmaj7:[53,57,60,64],dm7:[50,53,57,60],bbmaj7:[46,50,53,57],c6:[48,52,55,57]};

function energetic(){const random=rng(1101);
  return bed('music-energetic',124,8,(b,beat)=>{
    const prog=[CHORDS.am,CHORDS.f,CHORDS.c,CHORDS.g],roots=[45,41,48,43];
    for(let bar=0;bar<8;bar++){const t0=bar*4*beat,chord=prog[bar%4];
      for(let q=0;q<4;q++){add(b,kick(random),t0+q*beat,.95);if(q%2)add(b,clap(random),t0+q*beat,.42,.05);}
      for(let s=0;s<16;s++){const vel=[.5,.22,.36,.22][s%4];add(b,hat(random,s%4===2),t0+s*beat/4,vel*.34,.3);}
      for(let e=0;e<8;e++){const bass=subBass(roots[bar%4]-12+(e%4===3?7:0),beat*.46);add(b,bass,t0+e*beat/2+(e%2?0:.01),.55);}
      for(const off of [.5,1.5,2.5,3.5])add(b,stab(chord.map(n=>n+12),beat*.42),t0+off*beat,.36,-.15);
      const arp=[0,2,1,2,0,2,1,2];for(let s=0;s<8;s++)add(b,pluck(midi(chord[arp[s]]+24),.5,random,.65),t0+s*beat/2+beat/4,.16,.35);
    }
    // Sidechain: duck everything except the kick against each beat for the modern pumping feel.
    for(const ch of [b.L,b.R])for(let i=0;i<ch.length;i++){const phase=(i/SR%beat)/beat;ch[i]*=.62+.38*Math.min(1,phase*4.5);}
  });}
function cinematic(){const random=rng(2202);
  return bed('music-cinematic-night',92,8,(b,beat)=>{
    const prog=[CHORDS.dm,CHORDS.bb,CHORDS.f,CHORDS.c],roots=[38,34,41,36];
    for(let bar=0;bar<8;bar++){const t0=bar*4*beat;
      add(b,pad(prog[bar%4].concat(prog[bar%4][0]+12),beat*4+.8,1500,random),t0,.8,0);
      add(b,subBass(roots[bar%4],beat*3.6),t0,.55);
      add(b,tom(random,62,1.1),t0,.8,-.1);add(b,tom(random,70,.8),t0+beat*2.5,.45,.2);
      if(bar%2===1){add(b,tom(random,84,.5),t0+beat*3.25,.35,-.3);add(b,tom(random,92,.5),t0+beat*3.5,.38,.3);add(b,tom(random,100,.5),t0+beat*3.75,.42,0);}
      for(let e=0;e<8;e++)add(b,hat(random),t0+e*beat/2,e%2?.1:.16,.25);
    }
  });}
function editorial(){const random=rng(3303);
  return bed('music-premium-editorial',100,8,(b,beat)=>{
    const prog=[CHORDS.fmaj7,CHORDS.dm7,CHORDS.bbmaj7,CHORDS.c6],roots=[41,38,46,36];
    for(let bar=0;bar<8;bar++){const t0=bar*4*beat,chord=prog[bar%4];
      add(b,kick(random,{pitch:48,punch:.6,length:.35}),t0,.55);add(b,kick(random,{pitch:48,punch:.6,length:.35}),t0+beat*2.5,.42);
      add(b,clap(random,.18),t0+beat,.16,.1);add(b,clap(random,.18),t0+beat*3,.18,.1);
      for(let s=0;s<16;s++)add(b,shaker(random),t0+s*beat/4,s%2?.11:.18,.35);
      for(const [k,note] of chord.entries())add(b,keys(note+12,beat*3.8),t0+k*.012,.5,-.2);
      add(b,subBass(roots[bar%4],beat*1.8),t0,.42);add(b,subBass(roots[bar%4],beat*1.4),t0+beat*2.5,.34);
      const melody=[2,3,1,2,0,1,3,2];for(let s=0;s<8;s++)if(s!==5)add(b,pluck(midi(chord[melody[s]%chord.length]+24),.9,random,.45,.997),t0+s*beat/2,.2,.3);
    }
  });}
function tension(){const random=rng(4404);
  return bed('music-tension-bigmatch',140,8,(b,beat)=>{
    const roots=[40,40,43,38];
    for(let bar=0;bar<8;bar++){const t0=bar*4*beat,root=roots[bar%4];
      for(let e=0;e<8;e++)add(b,stringOstinato(root+(e%4===2?12:0)+12,beat*.44),t0+e*beat/2,e%2?.42:.55,e%2?.25:-.25);
      add(b,kick(random,{pitch:44,punch:.9,length:.5}),t0,.9);add(b,kick(random,{pitch:44,punch:.7,length:.4}),t0+beat*.5,.5);
      add(b,kick(random,{pitch:44,punch:.9,length:.5}),t0+beat*2,.8);
      add(b,clap(random,.3),t0+beat*2,.3);
      for(let q=0;q<4;q++)add(b,hat(random),t0+q*beat+beat/2,.14,.3);
      add(b,pad([root+24,root+31],beat*4+.6,1100,random),t0,.45);
      if(bar%4===3){const rise=sweep(mul(noise(beat*4,random),envelope(beat*4,beat*3.6,.2,0,.05)),'bp',400,5000,1.2);add(b,rise,t0,.08,0);}
    }
  });}

// ---------------------------------------------------------------------------------------------
// Ambience — crowd babble synthesised from formant-filtered, syllable-modulated noise voices
// ---------------------------------------------------------------------------------------------
const VOWELS=[[730,1090],[530,1840],[270,2290],[570,840],[300,870],[660,1720],[440,1020]];
function crowdVoices(seconds,random,{voices=48,level=1,cheer=0}={}){
  const b=stereo(seconds);
  for(let v=0;v<voices;v++){
    const src=noise(seconds,random),pan=random()*1.8-.9,rate=3.2+random()*2.6,phase=random()*6.28,dist=.35+random()*.65;
    const f1=new Biquad(),f2=new Biquad(),out=new Float32Array(src.length);let vowel=VOWELS[Math.floor(random()*VOWELS.length)];
    for(let i=0;i<src.length;i++){
      if(i%2205===0){if(random()<.25)vowel=VOWELS[Math.floor(random()*VOWELS.length)];const shift=.85+random()*.35;f1.set('bp',vowel[0]*shift,6);f2.set('bp',vowel[1]*shift,8);}
      const t=i/SR,syll=Math.max(0,Math.sin(phase+2*Math.PI*rate*t))**2*(.55+.45*Math.sin(phase*2+2*Math.PI*.21*t)),sw=cheer?Math.min(1,Math.max(0,(t-cheer)/1.5)):0;
      out[i]=(f1.run(src[i])*1.2+f2.run(src[i])*.7)*(syll*(1-sw)+sw*(.7+.3*Math.sin(2*Math.PI*5.5*t+phase)));
    }
    const lp=filter(out,'lp',1800+2600*(1-dist));add(b,lp,0,level*(.5/Math.sqrt(voices))*(1.2-dist*.6),pan);
  }
  return b;
}
function crowdBed(){const random=rng(5505),b=crowdVoices(22,random,{voices:56});
  const rumble=filter(pinkNoise(22,random),'lp',180);add(b,rumble,0,.6);
  const air=filter(filter(pinkNoise(22,random),'hp',2500),'lp',7000);add(b,air,0,.05,.2);
  reverb(b,{mix:.35,size:.9,damp:.4});
  const looped=crossfadeLoop(b,2);normalizePeak(looped,.7);return {id:'ambience-crowd-bed',buffer:looped,meta:{loopSeconds:20}};}
function stadiumLow(){const random=rng(6606),b=crowdVoices(22,random,{voices:30,level:.6});
  const rumble=filter(pinkNoise(22,random),'lp',120);add(b,rumble,0,1.1);
  const hum=filter(pinkNoise(22,random),'bp',95,2);add(b,hum,0,.35);
  reverb(b,{mix:.45,size:.93,damp:.5});
  const looped=crossfadeLoop(b,2);normalizePeak(looped,.7);return {id:'ambience-stadium-low',buffer:looped,meta:{loopSeconds:20}};}

// ---------------------------------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------------------------------
function fx(id,seconds,build,{space=.2}={}){const b=stereo(seconds);build(b);if(space)reverb(b,{mix:space});normalizePeak(b,.84);return {id,buffer:b,meta:{seconds}};}
const SFX=[
  ()=>fx('sfx-kick-impact',.9,b=>{const random=rng(7101);
    const thump=kick(random,{pitch:70,punch:.5,length:.3});add(b,thump,0,.9);
    const leather=filter(mul(noise(.05,random),envelope(.05,.0005,.02)),'bp',1900,1.4);add(b,leather,0,.9);
  },{space:.12}),
  ()=>fx('sfx-whoosh',.7,b=>{const random=rng(7202);
    const n=noise(.6,random),e=envelope(.6,.34,.26),w=sweep(mul(n,e),'bp',380,3200,1.4,1.2);
    for(let i=0;i<w.length;i++){const p=i/w.length,pan=-.8+1.6*p,gl=Math.cos((pan+1)*Math.PI/4)*Math.SQRT2,gr=Math.sin((pan+1)*Math.PI/4)*Math.SQRT2;b.L[i]+=w[i]*gl;b.R[i]+=w[i]*gr;}
  },{space:.15}),
  ()=>fx('sfx-transition-sweep',.6,b=>{const random=rng(7303);
    const n=pinkNoise(.5,random),e=envelope(.5,.4,.1),w=sweep(mul(n,e),'hp',300,6000,.8,1.4);add(b,w,0,1,0);
  },{space:.25}),
  ()=>fx('sfx-light-hit',1.6,b=>{const random=rng(7404);
    for(const [k,f] of [1318.5,1975.5,2637,3951].entries()){const s=mul(sine(f,1.4,k),envelope(1.4,.002,1.1));add(b,s,k*.006,.22/(k+1),k%2?.4:-.4);}
    const sparkle=filter(mul(noise(.4,random),envelope(.4,.001,.25)),'hp',6000);add(b,sparkle,0,.35);
  },{space:.35}),
  ()=>fx('sfx-sports-impact',1.4,b=>{const random=rng(7505);
    const boom=mul(sine(46,1.2),envelope(1.2,.004,.9));add(b,boom,0,.95);
    const body=filter(mul(noise(.25,random),envelope(.25,.001,.12)),'lp',900);add(b,body,0,.6);
  },{space:.3}),
  ()=>fx('sfx-crowd-swell',2.2,b=>{const random=rng(7606),crowd=crowdVoices(2.2,random,{voices:36,cheer:.2});
    const env=envelope(2.2,1.1,1.1);for(let i=0;i<b.L.length;i++){b.L[i]+=crowd.L[i]*(env[i]??0);b.R[i]+=crowd.R[i]*(env[i]??0);}
  },{space:.4}),
  ()=>fx('sfx-stadium-rise',2.6,b=>{const random=rng(7707),crowd=crowdVoices(2.6,random,{voices:40,cheer:.9});
    const env=envelope(2.6,2.1,.5);const rise=sweep(mul(pinkNoise(2.6,random),env),'hp',200,1400,.7);
    for(let i=0;i<b.L.length;i++){b.L[i]+=crowd.L[i]*(env[i]??0)+(rise[i]??0)*.25;b.R[i]+=crowd.R[i]*(env[i]??0)+(rise[i]??0)*.25;}
  },{space:.4}),
];

// ---------------------------------------------------------------------------------------------
// Encode + provenance
// ---------------------------------------------------------------------------------------------
const MOODS={'music-energetic':'ENERGETIC','music-cinematic-night':'CINEMATIC_MATCH_NIGHT','music-premium-editorial':'PREMIUM_EDITORIAL','music-tension-bigmatch':'TENSION_BIG_MATCH'};
function main(){
  mkdirSync(OUT,{recursive:true});const work=join(tmpdir(),`liva-audio-${process.pid}`);mkdirSync(work,{recursive:true});
  const items=[...[energetic,cinematic,editorial,tension].map(f=>({kind:'MUSIC',...f()})),
    ...[crowdBed,stadiumLow].map(f=>({kind:'AMBIENCE',...f()})),...SFX.map(f=>({kind:'SFX',...f()}))];
  const provenance=[];
  try{
    for(const item of items){
      const raw=join(work,`${item.id}.wav`),file=`${item.id}.m4a`,target=join(OUT,file);writeFileSync(raw,wav(item.buffer));
      const bitrate=item.kind==='SFX'?'96k':item.kind==='AMBIENCE'?'96k':'128k';
      // -fflags +bitexact / -map_metadata -1 keep the encoded bytes reproducible run to run.
      const run=spawnSync(FFMPEG,['-hide_banner','-loglevel','error','-i',raw,'-c:a','aac','-b:a',bitrate,'-ar',String(SR),'-ac','2','-map_metadata','-1','-fflags','+bitexact','-flags:a','+bitexact','-movflags','+faststart','-y',target]);
      if(run.status!==0)throw new Error(`ENCODE_FAILED ${item.id}: ${run.stderr}`);
      const data=readFileSync(target);
      provenance.push({id:item.id,file,kind:item.kind,...(MOODS[item.id]?{mood:MOODS[item.id]}:{}),...item.meta,
        sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length,
        origin:'ORIGINAL_PROCEDURAL',generator:`scripts/growth-audio-generate.mjs#${GENERATOR_VERSION}`,
        license:'Original work owned by LivaSports. No samples, recordings or third-party material. Cleared for commercial use.',
        commercialUse:true});
      console.info(JSON.stringify({id:item.id,bytes:data.length}));
    }
    writeFileSync(join(OUT,'PROVENANCE.json'),JSON.stringify({version:'v1',generator:GENERATOR_VERSION,sampleRate:SR,items:provenance},null,2)+'\n');
  }finally{rmSync(work,{recursive:true,force:true});}
}
main();
