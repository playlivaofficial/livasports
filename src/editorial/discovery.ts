import {canonicalSourceUrl, safeNewsDraft, type NewsDraft, type NewsRecord, type NewsSport} from './model';
import {licensedDiscoveryDesks} from './licensed-discovery';
import {primaryFeedDesks} from './primary-feeds';

/** Citation discovery only. These are not article/image syndication licences. */
export const discoveryDesks = [
  ...primaryFeedDesks,
  ...licensedDiscoveryDesks.map(d=>({...d,competition:`${d.sport}-news` as import('./taxonomy').NewsCompetition,country:'international' as const,name:'Wikinews · CC BY',url:'https://en.wikinews.org/wiki/Category:'+encodeURIComponent(d.category.replaceAll(' ','_'))})),
  {id:'dimayor',sport:'football',competition:'colombia-primera-a',country:'co',name:'DIMAYOR',url:'https://www.dimayor.com.co/liga-betplay-dimayor/'},
  {id:'liga1',sport:'football',competition:'peru-liga-1',country:'pe',name:'Liga1',url:'https://liga1.pe/noticias/'},
  {id:'nba',sport:'basketball',competition:'nba',country:'international',name:'NBA',url:'https://pr.nba.com/'},
  {id:'mlb',sport:'baseball',competition:'mlb',country:'international',name:'MLB',url:'https://www.mlb.com/news'},
  {id:'nfl',sport:'american-football',competition:'nfl',country:'international',name:'NFL',url:'https://www.nfl.com/news/'},
  {id:'nhl',sport:'ice-hockey',competition:'nhl',country:'international',name:'NHL',url:'https://www.nhl.com/news/'},
  {id:'wta',sport:'tennis',competition:'wta-rankings',country:'international',name:'WTA',url:'https://www.wtatennis.com/news'},
  {id:'ufc',sport:'mma',competition:'ufc',country:'international',name:'UFC',url:'https://www.ufc.com/news'},
] as const;
export interface DiscoveryCandidate {desk:string;url:string;headline:string;sourceDate:string|null}
export interface DiscoveryPackage {version:1;discoveredAt:string;candidates:DiscoveryCandidate[]}
export function isDiscoveryArticleUrl(id:string,value:unknown){
  const desk=discoveryDesks.find(d=>d.id===id),url=canonicalSourceUrl(value);if(!desk||!url||new URL(url).hostname!==new URL(desk.url).hostname.replace(/^www\./,''))return false;
  if(id.startsWith('wikinews-'))return /^\/wiki\/[^:?#]+$/.test(decodeURIComponent(new URL(url).pathname));
  const path=new URL(url).pathname.replace(/\/$/,'');
  if(url===canonicalSourceUrl(desk.url)||/\/(?:video|videos|tickets|shop|standings|rankings|category|tag|author|privacy|terms|info|lost-password|login|register|comision-de-licencias|tribunal-apelaciones|reglamentos)(?:\/|$)/i.test(path)||!path.split('/').at(-1)?.includes('-'))return false;
  if(id==='dimayor'||id==='dimayor-releases')return /^\/\d{4}\/\d{2}\/\d{2}\//.test(path);
  if(['mlb','nhl','nfl','ufc','nfl-cardinals'].includes(id))return path.startsWith('/news/');
  if(id==='wta')return /^\/news\/\d+\//.test(path);
  return true;
}
const clean=(s:unknown,max:number):s is string=>typeof s==='string'&&s.length<=max&&!/[<>\u0000-\u001f]/.test(s);
export function validateDiscoveryPackage(value:unknown,now=new Date()):value is DiscoveryPackage{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const p=value as DiscoveryPackage;
  if(Object.keys(p).some(k=>!['version','discoveredAt','candidates'].includes(k))||p.version!==1||typeof p.discoveredAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(p.discoveredAt)||!Number.isFinite(Date.parse(p.discoveredAt))||Date.parse(p.discoveredAt)>now.getTime()+300000||!Array.isArray(p.candidates)||p.candidates.length>24)return false;
  const urls=new Set<string>();
  return p.candidates.every(c=>{
    if(!c||typeof c!=='object'||Object.keys(c).some(k=>!['desk','url','headline','sourceDate'].includes(k)))return false;
    const desk=discoveryDesks.find(d=>d.id===c.desk),url=canonicalSourceUrl(c.url);
    if(!desk||!url||!isDiscoveryArticleUrl(c.desk,c.url)||!clean(c.headline,160)||c.headline.length<10||urls.has(url))return false;
    urls.add(url);
    if(c.sourceDate!==null){if(!/^\d{4}-\d{2}-\d{2}$/.test(c.sourceDate))return false;const date=new Date(c.sourceDate+'T00:00:00Z');if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==c.sourceDate||+date>+now)return false;}
    return true;
  });
}
/** Empty original text/date cannot accidentally pass review or become a public story. */
export function candidateDraft(candidate:DiscoveryCandidate):NewsDraft{
  const desk=discoveryDesks.find(d=>d.id===candidate.desk);if(!desk||!validateDiscoveryPackage({version:1,discoveredAt:new Date().toISOString(),candidates:[candidate]}))throw new Error('INVALID_DISCOVERY');
  const suffix=Array.from(canonicalSourceUrl(candidate.url)!).reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261).toString(16);
  const language=desk.country==='international'?'en':'es';
  const draft:NewsDraft={slug:`research-${desk.id}-${suffix}`,sport:desk.sport as NewsSport,country:desk.country,competition:desk.competition,
    title:{en:language==='en'?candidate.headline:'',es:language==='es'?candidate.headline:'',pt:''},summary:{en:'',es:'',pt:''},body:{en:'',es:'',pt:''},
    sourceName:desk.name,sourceUrl:candidate.url,sourcePublishedOn:candidate.sourceDate??'',image:'none',imageCaption:{en:'',es:'',pt:''},featured:false,originalLanguage:language,
    translationReview:{en:{state:language==='en'?'pending':'unavailable',reviewedAt:null},es:{state:language==='es'?'pending':'unavailable',reviewedAt:null},pt:{state:'unavailable',reviewedAt:null}}};
  if(!safeNewsDraft(draft))throw new Error('INVALID_DISCOVERY');return draft;
}
export function undiscoveredCandidates(p:DiscoveryPackage,records:readonly NewsRecord[]){
  const used=new Set(records.flatMap(r=>[r.draft.sourceUrl,r.published?.sourceUrl]).map(canonicalSourceUrl));
  return p.candidates.filter(c=>!used.has(canonicalSourceUrl(c.url)));
}
