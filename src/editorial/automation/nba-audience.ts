/** A reported audience statistic, NOT an independently measured rating, game result or record claim. */
export interface NbaAudience {type:'broadcast-audience';scope:'opening-night-doubleheader';measure:'average-viewers';averageMillions:string;platforms:['NBC','Peacock'];games:[[string,string],[string,string]];attribution:'NBA-reported'}
const teams:Record<string,string>={'76ers':'Philadelphia 76ers',Knicks:'New York Knicks',Thunder:'Oklahoma City Thunder',Spurs:'San Antonio Spurs',Celtics:'Boston Celtics',Pistons:'Detroit Pistons'};
export function parseNbaAudience(headline:string,body:string):NbaAudience|null{
 if(headline!=='NBA Tip-Off on NBC and Peacock delivers most-watched opening night ever')return null;
 const matches=[...body.matchAll(/(?:Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Monday)[’']s ([A-Za-z0-9]+)-([A-Za-z0-9]+) and ([A-Za-z0-9]+)-([A-Za-z0-9]+) doubleheader was the NBA[’']s most-watched opening night ever, averaging (\d{1,2}\.\d{2}) million viewers on NBC\/Peacock\./g)];
 if(matches.length!==1)return null;const m=matches[0];const names=m.slice(1,5).map(n=>teams[n]);if(names.some(n=>!n)||new Set(names).size!==4)return null;
 const facts:NbaAudience={type:'broadcast-audience',scope:'opening-night-doubleheader',measure:'average-viewers',averageMillions:m[5],platforms:['NBC','Peacock'],games:[[names[0],names[1]],[names[2],names[3]]],attribution:'NBA-reported'};
 return audienceErrors(facts).length?null:facts;
}
export function audienceErrors(d:NbaAudience){
 return d.scope!=='opening-night-doubleheader'||d.measure!=='average-viewers'||d.attribution!=='NBA-reported'||JSON.stringify(d.platforms)!=='["NBC","Peacock"]'||!/^\d{1,2}\.\d{2}$/.test(d.averageMillions)||Number(d.averageMillions)<=0||Number(d.averageMillions)>50||d.games.length!==2||d.games.some(g=>g.length!==2||g.some(n=>!Object.values(teams).includes(n)))||new Set(d.games.flat()).size!==4?['INVALID_AUDIENCE_FACTS']:[];
}
export function audienceCopyErrors(part:{title:string;summary:string;body:string},d:NbaAudience,lang:string){
 const errors:string[]=[],all=[part.title,part.summary,part.body].join(' '),decimal=d.averageMillions.replace('.',',');
 const body=part.body.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(!part.body.includes(d.averageMillions)&&!part.body.includes(decimal))errors.push(`${lang}:AUDIENCE_VALUE_MISMATCH`);
 if(!/\b(?:average|promedio|media)\b/.test(body)||!/(?:million|millones|milhoes)/.test(body)||!/(?:viewers|espectadores)/.test(body)||!/(?:reports?|reported|informa|informou|informo|segun|according)/.test(body)||!d.platforms.every(p=>part.body.includes(p)))errors.push(`${lang}:AUDIENCE_MEASURE_OR_ATTRIBUTION_MISSING`);
 // Headline claims of an all-time record and game results are outside this narrow contract.
 if(/\b(?:record|recorde|recordes|records|ever|hist[oó]ric\w*|r[eé]cord\w*|won|beat|victory|victoria|vitoria|derroto|venceu|gano|winning|won)\b/i.test(all))errors.push(`${lang}:UNVERIFIED_RECORD_OR_GAME_RESULT`);
 if(/most[- ]watched|mas vist[ao]|mais assistid[ao]|billion|billones|bilhoes/i.test(all.normalize('NFD').replace(/[\u0300-\u036f]/g,'')))errors.push(`${lang}:UNVERIFIED_RECORD_OR_GAME_RESULT`);
 const ordered=d.games.flat().map(name=>({name,index:part.body.indexOf(name)})).sort((a,b)=>a.index-b.index);
 if(ordered.every(x=>x.index>=0)){
  const pairs=[ordered.slice(0,2),ordered.slice(2)].map(pair=>pair.map(x=>x.name).sort().join('|')).sort();
  if(JSON.stringify(pairs)!==JSON.stringify(d.games.map(pair=>[...pair].sort().join('|')).sort()))errors.push(`${lang}:AUDIENCE_PAIRING_MISMATCH`);
 }
 if([...all.matchAll(/\d+[.,]\d+/g)].some(m=>m[0]!==d.averageMillions&&m[0]!==decimal))errors.push(`${lang}:AUDIENCE_VALUE_MISMATCH`);
 return errors;
}
