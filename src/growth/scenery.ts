import {BRAND} from './brand';

/**
 * Traffic Engine V1.2 — premium football background families.
 *
 * V1.1 drew one flat gradient plus two blur circles behind every scene, which is why the output read
 * as a template no matter how good the data was. Each family here builds real depth from layered
 * vector work — light, atmosphere, ground plane, crowd — while staying cheap enough that the existing
 * FFmpeg budget is untouched: these are static SVG layers rasterised once per scene, exactly like
 * before. Motion comes from the zoompan the renderer already applies.
 *
 * Everything is drawn, never photographed, so there is no stock imagery and no rights exposure.
 * A seed makes each family vary between fixtures while staying deterministic for the same input.
 */

export const SCENERY_FAMILIES=['STADIUM_NIGHT','PITCH_MATCHDAY','TUNNEL_BIGMATCH','EDITORIAL_SPORTS','CROWD_ATMOSPHERE','CHARACTER_WORLD'] as const;
export type SceneryFamily=typeof SCENERY_FAMILIES[number];

const W=1080,H=1920;
const seedOf=(value:string)=>[...value].reduce((total,char)=>(total*31+char.charCodeAt(0))>>>0,11);
/** Small deterministic jitter so two fixtures never light identically. */
const vary=(seed:number,index:number,range:number)=>((seed>>(index*3))%(range*2+1))-range;

export function sceneryDefs(id:string,family:SceneryFamily):string{

  const accent=BRAND.livasports.accent;
  const common=`<radialGradient id="${id}-haze"><stop offset="0" stop-color="#ffffff" stop-opacity=".16"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`+
    `<linearGradient id="${id}-vig" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity=".55"/><stop offset="0.4" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".68"/></linearGradient>`;
  switch(family){
    case 'STADIUM_NIGHT':return common+
      `<linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#04101a"/><stop offset="0.52" stop-color="#0a2231"/><stop offset="1" stop-color="#05161f"/></linearGradient>`+
      `<linearGradient id="${id}-turf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d4a34"/><stop offset="1" stop-color="#062a1e"/></linearGradient>`+
      `<linearGradient id="${id}-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".30"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`;
    case 'PITCH_MATCHDAY':return common+
      `<linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b2b3a"/><stop offset="1" stop-color="#07202c"/></linearGradient>`+
      `<linearGradient id="${id}-turf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14663f"/><stop offset="1" stop-color="#0a3d28"/></linearGradient>`;
    case 'TUNNEL_BIGMATCH':return common+
      `<linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050d14"/><stop offset="1" stop-color="#03080c"/></linearGradient>`+
      `<radialGradient id="${id}-mouth" cx="0.5" cy="0.42" r="0.5"><stop offset="0" stop-color="${accent}" stop-opacity=".55"/><stop offset="0.45" stop-color="#bfe9d8" stop-opacity=".22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`;
    case 'EDITORIAL_SPORTS':return common+
      `<linearGradient id="${id}-sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#071a24"/><stop offset="0.55" stop-color="#0b2b38"/><stop offset="1" stop-color="#061620"/></linearGradient>`+
      `<linearGradient id="${id}-bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${accent}" stop-opacity=".9"/><stop offset="1" stop-color="${accent}" stop-opacity=".1"/></linearGradient>`;
    default:return common+
      `<radialGradient id="${id}-spot" cx="0.5" cy="0.44" r="0.62"><stop offset="0" stop-color="#17404f" stop-opacity="1"/><stop offset="1" stop-color="#05121a" stop-opacity="1"/></radialGradient>`+
      `<linearGradient id="${id}-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d3446"/><stop offset="1" stop-color="#050f16"/></linearGradient>`;
  }
}

/** Floodlight rig with a soft cone; the cone is what sells "stadium at night" rather than "dark page". */
function floodlight(x:number,y:number,id:string,flip=false){
  const spread=250,drop=760;
  return `<g opacity=".9"><rect x="${x-92}" y="${y-16}" width="184" height="26" rx="10" fill="#16303c"/>`+
    `<rect x="${x-70}" y="${y-38}" width="140" height="24" rx="9" fill="#1d3f4e"/>`+
    `${[-54,-18,18,54].map(offset=>`<circle cx="${x+offset}" cy="${y-26}" r="11" fill="#eaf7ff" opacity=".92"/>`).join('')}`+
    `<rect x="${x-9}" y="${y+8}" width="18" height="150" fill="#122a35"/></g>`+
    `<path d="M${x-70} ${y-20} L${x+70} ${y-20} L${x+(flip?spread:spread*1.5)} ${y+drop} L${x-(flip?spread*1.5:spread)} ${y+drop}Z" fill="url(#${id}-beam)" opacity=".5"/>`;
}

/** Crowd read as depth, not detail: three bands of dots that get smaller, darker and denser upwards. */
function crowd(y:number,seed:number){
  const bands=[{offset:0,size:7,opacity:.30,step:26},{offset:58,size:6,opacity:.22,step:23},{offset:110,size:5,opacity:.15,step:20}];
  return bands.map((band,bandIndex)=>{
    const dots:string[]=[];
    for(let x=14;x<W;x+=band.step){
      const wobble=((seed>>(x%13))%5)-2;
      dots.push(`<circle cx="${x}" cy="${y+band.offset+wobble}" r="${band.size/2}" fill="${bandIndex%2?'#8fb6c6':'#c9dee8'}" opacity="${band.opacity}"/>`);
    }
    return dots.join('');
  }).join('');
}

/** Mown stripes in perspective: the cheapest honest cue that the ground plane is a football pitch. */
function pitchStripes(top:number,id:string,count=9){
  const rows:string[]=[];
  for(let index=0;index<count;index++){
    const t0=index/count,t1=(index+1)/count;
    const y0=top+(H-top)*t0*t0,y1=top+(H-top)*t1*t1;
    if(index%2===0)rows.push(`<rect x="0" y="${y0.toFixed(1)}" width="${W}" height="${(y1-y0).toFixed(1)}" fill="#ffffff" opacity=".035"/>`);
  }
  return `<rect x="0" y="${top}" width="${W}" height="${H-top}" fill="url(#${id}-turf)"/>${rows.join('')}`;
}

/** One background family, ready to sit behind the scene content. */
export function scenerySvg(family:SceneryFamily,id:string,seed:string):string{
  const s=seedOf(seed),accent=BRAND.livasports.accent;
  switch(family){
    case 'STADIUM_NIGHT':{
      const horizon=1180+vary(s,1,40);
      return `<rect width="${W}" height="${H}" fill="url(#${id}-sky)"/>`+
        `<ellipse cx="${540+vary(s,2,120)}" cy="${520}" rx="720" ry="420" fill="url(#${id}-haze)"/>`+
        `${crowd(760+vary(s,3,30),s)}`+
        `<rect x="0" y="${horizon-46}" width="${W}" height="46" fill="#0a2029" opacity=".9"/>`+
        `${pitchStripes(horizon,id)}`+
        `${floodlight(168+vary(s,4,26),300,id)}${floodlight(912+vary(s,5,26),300,id,true)}`+
        `<ellipse cx="540" cy="${horizon+300}" rx="520" ry="150" fill="none" stroke="#ffffff" stroke-width="4" opacity=".10"/>`+
        `<rect width="${W}" height="${H}" fill="url(#${id}-vig)"/>`;
    }
    case 'PITCH_MATCHDAY':{
      const horizon=880+vary(s,1,50);
      return `<rect width="${W}" height="${H}" fill="url(#${id}-sky)"/>`+
        `${crowd(430+vary(s,2,26),s)}`+
        `<rect x="0" y="${horizon-34}" width="${W}" height="34" fill="#08202b"/>`+
        `${pitchStripes(horizon,id,11)}`+
        // Broadcast geometry: halfway line, centre circle and a penalty arc in loose perspective.
        `<path d="M0 ${horizon+250} H${W}" stroke="#ffffff" stroke-width="5" opacity=".16"/>`+
        `<ellipse cx="540" cy="${horizon+250}" rx="250" ry="78" fill="none" stroke="#ffffff" stroke-width="5" opacity=".16"/>`+
        `<path d="M170 ${H} V${horizon+640} H910 V${H}" fill="none" stroke="#ffffff" stroke-width="5" opacity=".13"/>`+
        `<rect x="0" y="${horizon-6}" width="${W}" height="6" fill="${accent}" opacity=".5"/>`+
        `<rect width="${W}" height="${H}" fill="url(#${id}-vig)"/>`;
    }
    case 'TUNNEL_BIGMATCH':{
      const mouth=430+vary(s,1,36);
      return `<rect width="${W}" height="${H}" fill="url(#${id}-sky)"/>`+
        // Converging walls and ceiling give the tunnel its depth.
        `<path d="M0 0 L${340} ${mouth} L${340} ${mouth+620} L0 ${H}Z" fill="#081620"/>`+
        `<path d="M${W} 0 L${740} ${mouth} L${740} ${mouth+620} L${W} ${H}Z" fill="#081620"/>`+
        `<path d="M0 0 L${340} ${mouth} H${740} L${W} 0Z" fill="#050f16"/>`+
        `<rect x="340" y="${mouth}" width="400" height="620" fill="url(#${id}-mouth)"/>`+
        `${[0,1,2,3].map(index=>`<path d="M${340-index*84} ${mouth-index*54} V${H}" stroke="#ffffff" stroke-width="2" opacity="${.09-index*.02}"/><path d="M${740+index*84} ${mouth-index*54} V${H}" stroke="#ffffff" stroke-width="2" opacity="${.09-index*.02}"/>`).join('')}`+
        `<ellipse cx="540" cy="${mouth+300}" rx="330" ry="330" fill="url(#${id}-haze)"/>`+
        `<rect x="0" y="${H-380}" width="${W}" height="380" fill="#040c11" opacity=".75"/>`+
        `<rect width="${W}" height="${H}" fill="url(#${id}-vig)"/>`;
    }
    case 'EDITORIAL_SPORTS':{
      const tilt=vary(s,1,60);
      return `<rect width="${W}" height="${H}" fill="url(#${id}-sky)"/>`+
        // Layered diagonal blocks plus a measured grid: sports-magazine, not casino banner.
        `<path d="M-140 ${520+tilt} L${W+140} ${300+tilt} L${W+140} ${700+tilt} L-140 ${920+tilt}Z" fill="${accent}" opacity=".07"/>`+
        `<path d="M-140 ${1180-tilt} L${W+140} ${980-tilt} L${W+140} ${1140-tilt} L-140 ${1340-tilt}Z" fill="#ffffff" opacity=".04"/>`+
        `${[0,1,2,3,4,5].map(index=>`<path d="M${index*216} 0 V${H}" stroke="#ffffff" stroke-width="1" opacity=".05"/>`).join('')}`+
        `${[0,1,2,3,4,5,6,7].map(index=>`<path d="M0 ${index*240} H${W}" stroke="#ffffff" stroke-width="1" opacity=".035"/>`).join('')}`+
        `<rect x="0" y="${262+tilt}" width="${W}" height="8" fill="url(#${id}-bar)"/>`+
        `<ellipse cx="${840+vary(s,2,90)}" cy="620" rx="520" ry="420" fill="url(#${id}-haze)"/>`+
        `<rect width="${W}" height="${H}" fill="url(#${id}-vig)"/>`;
    }
    default:{
      const floor=1330+vary(s,1,40);
      return `<rect width="${W}" height="${H}" fill="url(#${id}-spot)"/>`+
        `${crowd(560+vary(s,2,30),s)}`+
        `<rect x="0" y="${floor}" width="${W}" height="${H-floor}" fill="url(#${id}-floor)"/>`+
        `<ellipse cx="540" cy="${floor}" rx="640" ry="120" fill="#ffffff" opacity=".05"/>`+
        `<ellipse cx="540" cy="${floor+40}" rx="430" ry="70" fill="${accent}" opacity=".10"/>`+
        `${[0,1,2,3,4].map(index=>`<path d="M${120+index*210} ${floor} L${40+index*250} ${H}" stroke="#ffffff" stroke-width="2" opacity=".05"/>`).join('')}`+
        `<rect width="${W}" height="${H}" fill="url(#${id}-vig)"/>`;
    }
  }
}

/**
 * Which background a scene wears. Deterministic from the fixture, channel and story, so a feed varies
 * day to day without ever being random — and so the same draft always regenerates identically.
 *
 * CHARACTER_WORLD is deliberately not selectable here. The character stage only earns a place once the
 * real original character artwork exists; until then every fixture falls back to the crest, stadium and
 * editorial treatments rather than shipping placeholder figures.
 */
const SELECTABLE:readonly SceneryFamily[]=['STADIUM_NIGHT','PITCH_MATCHDAY','TUNNEL_BIGMATCH','EDITORIAL_SPORTS','CROWD_ATMOSPHERE'];
/** Story angles that earn a specific treatment; everything else rotates through the full set. */
const ANGLE_PREFERENCE:Readonly<Record<string,readonly SceneryFamily[]>>={
  DERBY_RIVALRY:['TUNNEL_BIGMATCH','STADIUM_NIGHT'],
  BIG_MATCH:['TUNNEL_BIGMATCH','STADIUM_NIGHT','PITCH_MATCHDAY'],
  TABLE_PRESSURE:['EDITORIAL_SPORTS','PITCH_MATCHDAY','STADIUM_NIGHT'],
  ODDS_GAP:['EDITORIAL_SPORTS'],
  TOP_MATCHES_TODAY:['STADIUM_NIGHT','EDITORIAL_SPORTS'],
  WEEKEND_WATCHLIST:['PITCH_MATCHDAY','EDITORIAL_SPORTS','STADIUM_NIGHT'],
  // Creative templates, which is what the renderer has on the scene itself.
  MATCH_CLASH:['TUNNEL_BIGMATCH','STADIUM_NIGHT','PITCH_MATCHDAY','EDITORIAL_SPORTS','CROWD_ATMOSPHERE'],
  ODDS_COMPARISON:['EDITORIAL_SPORTS','PITCH_MATCHDAY'],
  PLAYER_CLASH:['STADIUM_NIGHT','TUNNEL_BIGMATCH'],
  CHARACTER_CLASH:['STADIUM_NIGHT','PITCH_MATCHDAY'],
};
export function pickScenery(fixtureSeed:string,angle:string,channel:string,rank=1):SceneryFamily{
  const pool=ANGLE_PREFERENCE[angle]??SELECTABLE;
  return pool[(seedOf(`${fixtureSeed}:${channel}:${angle}`)+rank)%pool.length]!;
}
