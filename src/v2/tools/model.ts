export const formations={'4-3-3':[4,3,3],'4-4-2':[4,4,2],'3-5-2':[3,5,2],'4-2-3-1':[4,2,3,1]} as const;
export type Formation=keyof typeof formations;
export interface BoardPlayer {id:number;name:string;x:number;y:number;team:0|1}
export interface BoardArrow {from:[number,number];to:[number,number]}
export interface BoardState {version:1;formation:Formation;title:string;notes:string;players:BoardPlayer[];arrows:BoardArrow[];opposition:boolean}
export const clampPosition=(value:number)=>Math.max(7,Math.min(93,value));
export function formationPlayers(formation:Formation,team:0|1=0):BoardPlayer[]{
  const rows=formations[formation],players:BoardPlayer[]=[{id:team*11+1,name:'1',x:50,y:team===0?89:11,team}];
  rows.forEach((count,row)=>{for(let n=0;n<count;n++)players.push({id:team*11+players.length+1,name:String(players.length+1),x:(n+1)*100/(count+1),y:team===0?72-row*52/(rows.length-1):28+row*52/(rows.length-1),team});});
  return players;
}
export function initialBoard():BoardState{return {version:1,formation:'4-3-3',title:'',notes:'',players:[...formationPlayers('4-3-3'),...formationPlayers('4-3-3',1)],arrows:[],opposition:false};}
/** Validate local storage as untrusted input; never hydrate arbitrary serialized state. */
export function parseBoard(value:string):BoardState|null{
  try{if(value.length>24000)return null;const data=JSON.parse(value) as BoardState;
    if(data.version!==1||!Object.hasOwn(formations,data.formation)||typeof data.title!=='string'||data.title.length>60||typeof data.notes!=='string'||data.notes.length>300||typeof data.opposition!=='boolean'||!Array.isArray(data.players)||data.players.length!==22||!Array.isArray(data.arrows)||data.arrows.length>30)return null;
    if(new Set(data.players.map(p=>p.id)).size!==22||data.players.some(p=>!Number.isInteger(p.id)||p.id<1||p.id>22||p.team!==(p.id<=11?0:1)||typeof p.name!=='string'||p.name.length>28||![p.x,p.y].every(n=>Number.isFinite(n)&&n>=7&&n<=93)))return null;
    if(data.arrows.some(a=>![a.from,a.to].every(point=>Array.isArray(point)&&point.length===2&&point.every(n=>Number.isFinite(n)&&n>=0&&n<=100))))return null;
    return {version:1,formation:data.formation,title:data.title,notes:data.notes,opposition:data.opposition,players:data.players.map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,team:p.team})),arrows:data.arrows.map(a=>({from:a.from,to:a.to}))};
  }catch{return null;}
}
export type OddsFormat='decimal'|'fractional'|'american';
export function decimalOdds(input:string,format:OddsFormat):number|null{
  const clean=input.trim().replace(',','.');let value:number;
  if(format==='fractional'){const parts=/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(clean);if(!parts||Number(parts[2])===0)return null;value=1+Number(parts[1])/Number(parts[2]);}
  else {if(!/^[+-]?\d+(?:\.\d+)?$/.test(clean))return null;const number=Number(clean);if(format==='american'){if(Math.abs(number)<100)return null;value=number>0?1+number/100:1+100/Math.abs(number);}else value=number;}
  return Number.isFinite(value)&&value>1&&value<=1000?value:null;
}
export function calculateManualOdds(inputs:string[],format:OddsFormat,stake:number){
  if(inputs.length<1||inputs.length>10||!Number.isFinite(stake)||stake<0||stake>1000000)return null;
  const values=inputs.map(input=>decimalOdds(input,format));if(values.some(value=>value===null))return null;
  const combined=(values as number[]).reduce((product,value)=>product*value,1);
  return {values:values as number[],combined,probability:100/combined,total:stake*combined,profit:stake*(combined-1)};
}
export function convertedOdds(decimal:number){
  const profit=decimal-1;
  if(!Number.isFinite(decimal)||decimal<=1)return {fractional:'—',american:'—'};
  // Avoid hundredths rounding: it previously turned legitimate 1.001 into 0/1.
  const plain=Number(profit.toPrecision(12)).toString(),digits=plain.includes('e')?null:(plain.split('.')[1]?.length??0);
  let fractional=plain+'/1';
  if(digits!==null){const denominator=10**digits,numerator=Math.round(Number(plain)*denominator);
    if(Number.isSafeInteger(numerator)&&Number.isSafeInteger(denominator)){let a=numerator,b=denominator;while(b){const remainder=a%b;a=b;b=remainder;}fractional=`${numerator/a}/${denominator/a}`;}}
  return {fractional,american:decimal>=2?`+${Math.round(profit*100)}`:String(Math.round(-100/profit))};
}
