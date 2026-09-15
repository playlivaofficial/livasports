import type {SlipUiLocale} from './localization';
import {selectionLabel,slipCopy} from './localization';
import {comparisonCopy} from './comparison-copy';
import {formatCombinedOdds,formatMoney,potentialReturn as estimateReturn} from './decimal';
import type {SlipComparison} from './comparison-types';
import type {ResolvedSelection,SavedSelection} from './types';

export interface SlipShareLeg {
  fixture:string;
  competition:string;
  market:string;
  outcome:string;
  odds:string;
}
export interface SlipShareBookmaker {
  name:string;
  complete:boolean;
  combined:string|null;
  potentialReturn:string|null;
  best:boolean;
  missing:string[];
  incompleteLabel:string;
  estimated:boolean;
}
export interface SlipSharePayload {
  slipId:string;
  generatedAt:string;
  stake:string;
  stakeLabel:string;
  returnLabel:string;
  bestCombined:string|null;
  bestReturn:string|null;
  bestName:string|null;
  legs:SlipShareLeg[];
  bookmakers:SlipShareBookmaker[];
  notice:string;
  responsible:string;
  notAReceipt:string;
  subjectToChange:string;
}

export function slipSharePayload(args:{
  locale:SlipUiLocale;
  slipId:string;
  stake:string;
  generatedAt:string;
  selections:SavedSelection[];
  resolved:ResolvedSelection[];
  comparison:SlipComparison|null;
}):SlipSharePayload {
  const text=slipCopy[args.locale];
  const byKey=new Map(args.resolved.map(v=>[`${v.selection.fixturePublicId}:${v.selection.market}:${v.selection.outcome}`,v]));
  const complete=args.comparison?.bookmakers.filter(b=>b.complete)??[];
  const best=complete.find(b=>b.best)??complete[0]??null;
  return {
    slipId:args.slipId,generatedAt:args.generatedAt,stake:formatMoney(args.stake,args.locale)??args.stake,
    stakeLabel:text.stake,returnLabel:best?.estimated?comparisonCopy[args.locale].estimatedPotentialReturn:text.potentialReturn,
    bestCombined:best?.combinedDecimalOdds?`${best.estimated?'~':''}${formatCombinedOdds(best.combinedDecimalOdds,args.locale)}`:null,
    bestReturn:best?.combinedDecimalOdds?`${best.estimated?'~':''}${formatMoney(estimateReturn(args.stake,best.combinedDecimalOdds)??'',args.locale)}`:null,
    bestName:best?.displayName??null,
    legs:args.selections.map(s=>{
      const view=byKey.get(`${s.fixturePublicId}:${s.market}:${s.outcome}`);
      const fixture=view?.fixture;
      return {
        fixture:fixture?`${fixture.home} × ${fixture.away}`:text.missing,
        competition:fixture?.competition??'',
        market:text.markets[s.market],
        outcome:selectionLabel(s,args.locale,fixture),
        odds:view?.price?formatCombinedOdds(view.price.decimalOdds,args.locale)||slipCopy[args.locale].states.UNAVAILABLE:slipCopy[args.locale].states.UNAVAILABLE,
      };
    }),
    bookmakers:(args.comparison?.bookmakers??[]).map(b=>({
      name:b.displayName,complete:b.complete,best:b.best,estimated:b.estimated,
      combined:b.combinedDecimalOdds?`${b.estimated?'~':''}${formatCombinedOdds(b.combinedDecimalOdds,args.locale)}`:null,
      potentialReturn:b.combinedDecimalOdds?`${b.estimated?'~':''}${formatMoney(estimateReturn(args.stake,b.combinedDecimalOdds)??'',args.locale)}`:null,
      missing:b.selectionQuotes.filter(q=>!q.decimalOdds).map(q=>`${q.fixture?`${q.fixture.home} × ${q.fixture.away}`:text.missing} — ${text.markets[q.selection.market]} ${selectionLabel(q.selection,args.locale,q.fixture)}`),
      incompleteLabel:b.complete?'':comparisonCopy[args.locale].partial,
    })),
    notice:text.disclaimer,responsible:'18+',notAReceipt:text.notAReceipt,subjectToChange:text.subjectToChange,
  };
}

export function drawSlipShareCard(ctx:CanvasRenderingContext2D,payload:SlipSharePayload,width=1080,height=1350){
  ctx.fillStyle='#071019';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#24d39b';ctx.fillRect(0,0,width,8);
  ctx.fillStyle='#f4f7fa';ctx.font='700 54px Inter, system-ui, sans-serif';ctx.fillText('LivaSports',48,80);
  ctx.fillStyle='#9aaabd';ctx.font='500 22px Inter, system-ui, sans-serif';ctx.fillText(payload.notAReceipt,48,118);
  let y=170;
  ctx.fillStyle='#a7b4c2';ctx.font='600 20px Inter, system-ui, sans-serif';
  ctx.fillText(`${payload.stakeLabel}: ${payload.stake}`,48,y);y+=36;
  if(payload.bestCombined){ctx.fillStyle='#24d39b';ctx.font='700 36px Inter, system-ui, sans-serif';ctx.fillText(`${payload.bestName??''}  ${payload.bestCombined}`,48,y);y+=40;
    if(payload.bestReturn){ctx.fillStyle='#f4f7fa';ctx.font='600 28px Inter, system-ui, sans-serif';ctx.fillText(`${payload.returnLabel}: ${payload.bestReturn}`,48,y);y+=50;}}
  y+=10;
  ctx.fillStyle='#9aaabd';ctx.font='600 18px Inter, system-ui, sans-serif';ctx.fillText(payload.generatedAt.slice(0,16).replace('T',' ')+' UTC',48,y);
  for(const leg of payload.legs.slice(0,8)){
    y+=58;ctx.fillStyle='#f4f7fa';ctx.font='650 26px Inter, system-ui, sans-serif';ctx.fillText(leg.fixture.slice(0,42),48,y);
    y+=28;ctx.fillStyle='#9aaabd';ctx.font='500 20px Inter, system-ui, sans-serif';ctx.fillText(`${leg.competition} · ${leg.market} · ${leg.outcome}  ${leg.odds}`,48,y);
  }
  y+=40;
  for(const book of payload.bookmakers){
    ctx.fillStyle=book.best?'#24d39b':'#f4f7fa';ctx.font='700 24px Inter, system-ui, sans-serif';
    ctx.fillText(`${book.name}  ${book.complete?`${book.combined??''}  ${book.potentialReturn??''}`:book.incompleteLabel}`,48,y);y+=36;
  }
  ctx.fillStyle='#9aaabd';ctx.font='500 18px Inter, system-ui, sans-serif';
  wrap(ctx,payload.notice,48,height-150,width-96,26);
  ctx.fillText(`${payload.responsible}  ·  ${payload.subjectToChange}  ·  ${payload.generatedAt.slice(0,16).replace('T',' ')} UTC`,48,height-48);
}

function wrap(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,max:number,line:number){
  const words=text.split(' ');let row='';let top=y;
  for(const word of words){const next=row?`${row} ${word}`:word;if(ctx.measureText(next).width>max){ctx.fillText(row,x,top);row=word;top+=line;}else row=next;}
  if(row)ctx.fillText(row,x,top);
}

export async function shareSlipImage(payload:SlipSharePayload):Promise<'shared'|'downloaded'|'failed'> {
  if(typeof document==='undefined')return 'failed';
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
  const ctx=canvas.getContext('2d');if(!ctx)return 'failed';
  drawSlipShareCard(ctx,payload);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)return 'failed';
  const file=new File([blob],'livasports-slip.png',{type:'image/png'});
  const nav=navigator as Navigator & {share?:(data:ShareData)=>Promise<void>;canShare?:(data:ShareData)=>boolean};
  try{
    if(nav.share&&(!nav.canShare||nav.canShare({files:[file]}))){await nav.share({files:[file],title:'LivaSports',text:payload.notAReceipt});return 'shared';}
  }catch(error){if((error as DOMException).name==='AbortError')return 'shared';}
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=file.name;a.click();URL.revokeObjectURL(url);return 'downloaded';
}
