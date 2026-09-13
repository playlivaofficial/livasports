import {FOOTBALL_COMPETITION_TARGETS} from '@/config/footballCompetitions';

const names:Record<string,string>={
  'brasileirao-serie-a':'Brazilian Serie A','brasileirao-serie-b':'Brazilian Serie B',
  'copa-do-brasil':'Brazil Cup','copa-do-nordeste':'Northeast Cup',
  'argentina-primera-division':'Argentine Primera Division',
};
const competitions=new Map(FOOTBALL_COMPETITION_TARGETS.flatMap(target=>
  [target.canonicalName,target.displayNames.br,target.displayNames.mx].map(name=>[name,names[target.slug]??target.canonicalName] as const)));
export function englishCompetition(value:string){return competitions.get(value)??value;}

// Translate presentation fields on a copy. Stored sporting facts and IDs are untouched.
export function englishSportsData<T>(input:T):T {
  function visit(value:unknown,key?:string):unknown {
    if(typeof value==='string'&&key==='competition')return englishCompetition(value);
    if(Array.isArray(value))return value.map(item=>visit(item));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,visit(item,name)]));
    return value;
  }
  return visit(input) as T;
}
export function englishCountry(_locale:'en',value:string|null|undefined):string|null {
  if(!value)return null;
  const aliases:Record<string,string>={Brasil:'Brazil',México:'Mexico',Inglaterra:'England',França:'France',Francia:'France',Alemanha:'Germany',Alemania:'Germany',Itália:'Italy',Italia:'Italy',Espanha:'Spain',España:'Spain'};
  return aliases[value]??value;
}
const positions:Record<string,string>={goalkeeper:'Goalkeeper',keeper:'Goalkeeper',defender:'Defender',centreback:'Centre-back',centerback:'Centre-back',leftback:'Left-back',rightback:'Right-back',wingback:'Wing-back',midfielder:'Midfielder',defensivemidfield:'Defensive midfielder',centralmidfield:'Central midfielder',attackingmidfield:'Attacking midfielder',leftmidfield:'Left midfielder',rightmidfield:'Right midfielder',attacker:'Forward',forward:'Forward',centreforward:'Centre-forward',centerforward:'Centre-forward',striker:'Striker',leftwing:'Left winger',rightwing:'Right winger',winger:'Winger'};
export function englishPosition(_locale:'en',...candidates:Array<string|null|undefined>):string|null {
  for(const candidate of candidates){const label=positions[(candidate??'').toLowerCase().replace(/[^a-z]/g,'')];if(label)return label;}
  return null;
}
