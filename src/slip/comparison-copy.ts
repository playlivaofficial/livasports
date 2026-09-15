import type {SelectionQuote} from './comparison-types';
import {slipCopy,type SlipUiLocale} from './localization';

export const comparisonCopy={
  br:{title:'Comparar casas',intro:'As mesmas seleções, com todas as odds de uma única casa.',jump:'Comparar casas ↓',
    checking:'Consultando a comparação…',unavailable:'Comparação temporariamente indisponível. Tentaremos novamente.',
    empty:'Adicione seleções para comparar casas.',one:'Uma seleção: a odd combinada corresponde à sua odd individual.',
    noBookmaker:'Nenhuma casa verificada para comparação nesta região.',available:'Seleções disponíveis',combined:'Odd combinada',
    complete:'Todas as seleções disponíveis',partial:'Indisponível para este cupom completo',none:'Nenhuma seleção com preço atual',
    missing:'Faltam',best:'Melhor retorno para este cupom',bestEstimated:'Melhor retorno estimado',tie:'Empate no melhor retorno para este cupom',tieEstimated:'Empate no melhor retorno estimado',
    noTotal:'Indisponível para o cupom completo.',cta:'Ver odds',destination:'Abre o site da casa. Confira as seleções e as odds lá.',
    gated:'Link da casa indisponível.',disclosure:'Podemos receber comissão pelo link. Isso não altera a comparação.',
    potentialReturn:'Retorno potencial',estimatedPotentialReturn:'Retorno potencial estimado',difference:'Diferença vs melhor',oddsMayChange:'Cotações podem mudar na casa de apostas.',estimatedDisclaimer:'Comparação estimada. As cotações reais na casa podem ser diferentes.',
    proxyBasedOn:(name:string)=>`Cotação aproximada · baseada na ${name}`,ctaAt:(name:string)=>`Ver odds na ${name}`,
    summary:(complete:number,total:number)=>`${complete} de ${total} casas com todas as seleções disponíveis.`,
    updated:'Preço atualizado',stale:'Odd desatualizada',withdrawn:'Mercado retirado',closed:'Mercado encerrado',
    suspended:'Mercado suspenso',matchFinished:'Partida encerrada',
    fixtureUnavailable:'Partida indisponível',marketUnavailable:'Mercado indisponível nesta casa',
    marketUnavailableAt:(name:string)=>`Mercado indisponível na ${name}`,
    selectionUnavailableAt:(name:string)=>`Seleção indisponível na ${name}`,
    missingCount:(n:number)=>n===1?'Falta:':`Faltam ${n}:`},
  mx:{title:'Comparar casas',intro:'Las mismas selecciones, con todas las cuotas de una sola casa.',jump:'Comparar casas ↓',
    checking:'Consultando la comparación…',unavailable:'Comparación temporalmente no disponible. Volveremos a intentarlo.',
    empty:'Agrega selecciones para comparar casas.',one:'Una selección: la cuota combinada corresponde a su cuota individual.',
    noBookmaker:'No hay casas verificadas para comparar en esta región.',available:'Selecciones disponibles',combined:'Cuota combinada',
    complete:'Todas las selecciones disponibles',partial:'No disponible para este cupón completo',none:'Ninguna selección con cuota vigente',
    missing:'Faltan',best:'Mejor retorno para este cupón',bestEstimated:'Mejor retorno estimado',tie:'Empate en el mejor retorno para este cupón',tieEstimated:'Empate en el mejor retorno estimado',
    noTotal:'No disponible para el cupón completo.',cta:'Ver cuotas',destination:'Abre el sitio de la casa. Revisa las selecciones y las cuotas allí.',
    gated:'Enlace de la casa no disponible.',disclosure:'Podemos recibir una comisión por el enlace. Esto no altera la comparación.',
    potentialReturn:'Retorno potencial',estimatedPotentialReturn:'Retorno potencial estimado',difference:'Diferencia vs el mejor',oddsMayChange:'Las cuotas pueden cambiar en la casa de apuestas.',estimatedDisclaimer:'Comparación estimada. Las cuotas reales de la casa pueden variar.',
    proxyBasedOn:(name:string)=>`Cuota aproximada · basada en ${name}`,ctaAt:(name:string)=>`Ver cuotas en ${name}`,
    summary:(complete:number,total:number)=>`${complete} de ${total} casas con todas las selecciones disponibles.`,
    updated:'Cuota actualizada',stale:'Cuota desactualizada',withdrawn:'Mercado retirado',closed:'Mercado cerrado',
    suspended:'Mercado suspendido',matchFinished:'Partido finalizado',
    fixtureUnavailable:'Partido no disponible',marketUnavailable:'Mercado no disponible en esta casa',
    marketUnavailableAt:(name:string)=>`Mercado no disponible en ${name}`,
    selectionUnavailableAt:(name:string)=>`Selección no disponible en ${name}`,
    missingCount:(n:number)=>n===1?'Falta:':`Faltan ${n}:`},
  en:{title:'Compare bookmakers',intro:'The same selections, using every price from a single bookmaker.',jump:'Compare bookmakers ↓',
    checking:'Loading the comparison…',unavailable:'Comparison is temporarily unavailable. We will try again.',
    empty:'Add selections to compare bookmakers.',one:'One selection: combined odds match that individual price.',
    noBookmaker:'No verified bookmakers to compare in this region.',available:'Available selections',combined:'Combined odds',
    complete:'Every selection available',partial:'Unavailable for this complete slip',none:'No selection with a current price',
    missing:'Missing',best:'Best return for this slip',bestEstimated:'Best estimated return',tie:'Tied best return for this slip',tieEstimated:'Tied best estimated return',
    noTotal:'Unavailable for complete slip',cta:'View odds',destination:'Opens the bookmaker site. Check the selections and odds there.',
    gated:'Bookmaker link unavailable.',disclosure:'We may receive a commission from the link. That does not change the comparison.',
    potentialReturn:'Potential return',estimatedPotentialReturn:'Estimated potential return',difference:'Difference vs best',oddsMayChange:'Odds can change at the bookmaker.',estimatedDisclaimer:'Estimated comparison only. Actual bookmaker odds may differ.',
    proxyBasedOn:(name:string)=>`Approx. price · based on ${name}`,ctaAt:(name:string)=>`View odds at ${name}`,
    summary:(complete:number,total:number)=>`${complete} of ${total} bookmakers have every selected outcome.`,
    updated:'Odds updated',stale:'Odds outdated',withdrawn:'Market withdrawn',closed:'Market closed',
    suspended:'Market suspended',matchFinished:'Match finished',
    fixtureUnavailable:'Match unavailable',marketUnavailable:'Market unavailable at this bookmaker',
    marketUnavailableAt:(name:string)=>`Market unavailable at ${name}`,
    selectionUnavailableAt:(name:string)=>`Selection unavailable at ${name}`,
    missingCount:(n:number)=>n===1?'Missing:':`Missing ${n}:`},
} satisfies Record<SlipUiLocale,{summary:(complete:number,total:number)=>string;missingCount:(n:number)=>string;marketUnavailableAt:(name:string)=>string;selectionUnavailableAt:(name:string)=>string;proxyBasedOn:(name:string)=>string;ctaAt:(name:string)=>string;[key:string]:unknown}>;

export function bookmakerShortName(bookmakerId:string,displayName:string):string {
  if(bookmakerId==='betano.bet.br'||/^betano/i.test(displayName))return 'Betano';
  if(bookmakerId==='betsson'||/^betsson/i.test(displayName))return 'Betsson';
  return displayName;
}

/** Human copy for an incomplete bookmaker leg. Never maps a missing quote to “Market closed”. */
export function missingLegReason(quote:Pick<SelectionQuote,'state'|'reason'|'diagnosticCode'>,bookmakerName:string,locale:SlipUiLocale):string {
  const text=comparisonCopy[locale];
  if(quote.state==='CLOSED')return text.closed;
  if(quote.state==='SUSPENDED')return text.suspended;
  if(quote.diagnosticCode==='STALE_QUOTE'||quote.state==='STALE')return text.stale;
  if(quote.diagnosticCode==='WITHDRAWN')return text.withdrawn;
  if(quote.diagnosticCode==='MATCH_FINISHED'||quote.state==='MATCH_FINISHED')return text.matchFinished;
  if(quote.diagnosticCode==='MATCH_STARTED'||quote.state==='MATCH_STARTED')return slipCopy[locale].states.MATCH_STARTED;
  if(quote.diagnosticCode==='MARKET_MISSING')return text.marketUnavailableAt(bookmakerName);
  if(quote.diagnosticCode==='FIXTURE_MISSING')return text.fixtureUnavailable;
  return text.selectionUnavailableAt(bookmakerName);
}
