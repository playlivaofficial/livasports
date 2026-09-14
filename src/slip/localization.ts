import type {CanonicalSelection,ResolvedSelection,SelectionState} from './types';

export type SlipUiLocale='br'|'mx'|'en';
const sharedOutcomes={HOME:'Mandante',DRAW:'Empate',AWAY:'Visitante',OVER:'Mais de 2,5',UNDER:'Menos de 2,5',YES:'Sim',NO:'Não'} as const;
export const slipCopy={
  br:{title:'Meu bilhete',selections:'seleções',selection:'seleção',close:'Fechar bilhete',remove:'Remover',clear:'Limpar tudo',clearQuestion:'Remover todas as seleções?',
    confirmClear:'Sim, limpar',cancel:'Cancelar',replace:'Substituir seleção',replaceQuestion:'Já existe uma seleção deste mercado no bilhete.',replaceWith:'Nova seleção',
    emptyTitle:'Seu próximo palpite começa aqui',empty:'Toque em uma odd disponível nas partidas para montar seu bilhete.',browse:'Explorar partidas',
    disclaimer:'Apenas planejamento. Nenhuma aposta foi realizada. Cotações podem mudar na casa de apostas.',local:'Salvo somente neste navegador. Sem cadastro.',
    reference:'Referência atual',best:'Melhor odd atual observada',single:'Uma casa elegível',checking:'Verificando odds…',offline:'Sem conexão. Suas seleções continuam salvas.',
    retry:'Não foi possível verificar as odds agora. Suas seleções foram mantidas.',geo:'Sem odds atuais verificadas para este país.',missing:'Partida indisponível',
    updated:'Consulta ao LivaSports',currentCount:'com odds atuais',scope:'Pré-jogo · 90 minutos',add:'Adicionar ao bilhete',selected:'No bilhete',
    stake:'Valor informativo',stakeHint:'R$ 10',potentialReturn:'Retorno potencial',combined:'Odd combinada',oddsMayChange:'Cotações podem mudar na casa de apostas.',
    freshnessNow:'Cotações atualizadas agora',freshnessAgo:(n:number)=>n<=0?'Cotações atualizadas agora':`Cotações atualizadas há ${n} min`,
    priceUpdated:'Preço atualizado',subjectToChange:'Sujeito a alteração',share:'Compartilhar cupom',shareHint:'Imagem do planejamento LivaSports. Não é um comprovante de aposta.',
    notAReceipt:'Isto não é um comprovante oficial de Betano ou Betsson.',invalidStake:'Informe um valor positivo, com até duas casas decimais.',
    browseEn:'/br/futebol',
    markets:{MATCH_WINNER:'Resultado final',TOTAL_GOALS:'Total de gols · 2,5',BTTS:'Ambas marcam'},
    outcomes:{HOME:'Mandante',DRAW:'Empate',AWAY:'Visitante',OVER:'Mais de 2,5',UNDER:'Menos de 2,5',YES:'Sim',NO:'Não'},
    states:{CURRENT:'Odd atual',PRICE_CHANGED:'Odd atualizada',STALE:'Odd desatualizada',UNAVAILABLE:'Odd indisponível',SUSPENDED:'Mercado suspenso',CLOSED:'Mercado encerrado',MATCH_STARTED:'Partida iniciada',MATCH_FINISHED:'Partida encerrada'},
    notices:{OUTBOUND_UNAVAILABLE:'Não foi possível abrir a casa. Confira as odds atuais do bilhete.',ADDED:'Seleção adicionada',REPLACED:'Seleção substituída',REMOVED:'Seleção removida',CLEARED:'Bilhete limpo',UNCHANGED:'Seleção já está no bilhete',LIMIT:'Você pode adicionar até 10 seleções.',EXPIRED:'Esta odd não está mais disponível.',
      RECOVERED:'O bilhete salvo foi recuperado. Seleções incompatíveis foram removidas.',UNSUPPORTED_VERSION:'Este bilhete usa uma versão não compatível. Você pode começar um novo.',STORAGE_UNAVAILABLE:'Não foi possível salvar no navegador. O bilhete ficará disponível somente nesta página.',INVALID_STAKE:'Informe um valor positivo válido.'}},
  mx:{title:'Mi boleto',selections:'selecciones',selection:'selección',close:'Cerrar boleto',remove:'Quitar',clear:'Borrar todo',clearQuestion:'¿Quitar todas las selecciones?',
    confirmClear:'Sí, borrar',cancel:'Cancelar',replace:'Reemplazar selección',replaceQuestion:'Ya tienes una selección de este mercado en el boleto.',replaceWith:'Nueva selección',
    emptyTitle:'Tu próximo pronóstico empieza aquí',empty:'Toca una cuota disponible en los partidos para armar tu boleto.',browse:'Explorar partidos',
    disclaimer:'Solo para planificar. No se ha realizado ninguna apuesta. Las cuotas pueden cambiar en la casa de apuestas.',local:'Guardado solo en este navegador. Sin registro.',
    reference:'Referencia actual',best:'Mejor cuota actual observada',single:'Una casa elegible',checking:'Verificando cuotas…',offline:'Sin conexión. Tus selecciones siguen guardadas.',
    retry:'No fue posible verificar las cuotas. Conservamos tus selecciones.',geo:'No hay cuotas actuales verificadas para este país.',missing:'Partido no disponible',
    updated:'Consulta a LivaSports',currentCount:'con cuotas actuales',scope:'Prepartido · 90 minutos',add:'Agregar al boleto',selected:'En el boleto',
    stake:'Importe informativo',stakeHint:'MX$ 10',potentialReturn:'Retorno potencial',combined:'Cuota combinada',oddsMayChange:'Las cuotas pueden cambiar en la casa de apuestas.',
    freshnessNow:'Cuotas actualizadas ahora',freshnessAgo:(n:number)=>n<=0?'Cuotas actualizadas ahora':`Cuotas actualizadas hace ${n} min`,
    priceUpdated:'Precio actualizado',subjectToChange:'Sujeto a cambio',share:'Compartir cupón',shareHint:'Imagen de planificación LivaSports. No es un comprobante de apuesta.',
    notAReceipt:'Esto no es un comprobante oficial de Betano o Betsson.',invalidStake:'Ingresa un valor positivo, con hasta dos decimales.',
    browseEn:'/mx/futbol',
    markets:{MATCH_WINNER:'Resultado final',TOTAL_GOALS:'Total de goles · 2.5',BTTS:'Ambos anotan'},
    outcomes:{HOME:'Local',DRAW:'Empate',AWAY:'Visitante',OVER:'Más de 2.5',UNDER:'Menos de 2.5',YES:'Sí',NO:'No'},
    states:{CURRENT:'Cuota actual',PRICE_CHANGED:'Cuota actualizada',STALE:'Cuota desactualizada',UNAVAILABLE:'Cuota no disponible',SUSPENDED:'Mercado suspendido',CLOSED:'Mercado cerrado',MATCH_STARTED:'Partido iniciado',MATCH_FINISHED:'Partido finalizado'},
    notices:{OUTBOUND_UNAVAILABLE:'No se pudo abrir la casa. Revisa las cuotas actuales del boleto.',ADDED:'Selección agregada',REPLACED:'Selección reemplazada',REMOVED:'Selección eliminada',CLEARED:'Boleto vacío',UNCHANGED:'La selección ya está en tu boleto',LIMIT:'Puedes agregar hasta 10 selecciones.',EXPIRED:'Esta cuota ya no está disponible.',
      RECOVERED:'Se recuperó tu boleto. Se quitaron las selecciones incompatibles.',UNSUPPORTED_VERSION:'Este boleto usa una versión no compatible. Puedes empezar uno nuevo.',STORAGE_UNAVAILABLE:'No se pudo guardar en el navegador. El boleto solo estará disponible en esta página.',INVALID_STAKE:'Ingresa un valor positivo válido.'}},
  en:{title:'My slip',selections:'selections',selection:'selection',close:'Close slip',remove:'Remove',clear:'Clear all',clearQuestion:'Remove every selection?',
    confirmClear:'Yes, clear',cancel:'Cancel',replace:'Replace selection',replaceQuestion:'This market already has a selection on the slip.',replaceWith:'New selection',
    emptyTitle:'Build your next slip here',empty:'Tap available odds on the fixtures to add selections.',browse:'Browse matches',
    disclaimer:'Planning only. No bet has been placed. Odds can change at the bookmaker.',local:'Saved only in this browser. No account required.',
    reference:'Current reference',best:'Best current observed price',single:'One eligible bookmaker',checking:'Checking odds…',offline:'You are offline. Your selections are still saved.',
    retry:'Odds could not be checked just now. Your selections were kept.',geo:'No current verified odds for this country.',missing:'Match unavailable',
    updated:'LivaSports check',currentCount:'with current odds',scope:'Pregame · 90 minutes',add:'Add to slip',selected:'On slip',
    stake:'Informational stake',stakeHint:'R$ 10',potentialReturn:'Potential return',combined:'Combined odds',oddsMayChange:'Odds can change at the bookmaker.',
    freshnessNow:'Odds updated just now',freshnessAgo:(n:number)=>n<=0?'Odds updated just now':`Odds updated ${n} min ago`,
    priceUpdated:'Price updated',subjectToChange:'Subject to change',share:'Share slip',shareHint:'LivaSports planning image. Not a betting receipt.',
    notAReceipt:'This is not an official Betano or Betsson bet receipt.',invalidStake:'Enter a positive amount with up to two decimal places.',
    browseEn:'/en/football',
    markets:{MATCH_WINNER:'Full-time result',TOTAL_GOALS:'Total goals · 2.5',BTTS:'Both teams to score'},
    outcomes:{HOME:'Home',DRAW:'Draw',AWAY:'Away',OVER:'Over 2.5',UNDER:'Under 2.5',YES:'Yes',NO:'No'},
    states:{CURRENT:'Current price',PRICE_CHANGED:'Price updated',STALE:'Odds out of date',UNAVAILABLE:'Odds unavailable',SUSPENDED:'Market suspended',CLOSED:'Market closed',MATCH_STARTED:'Match started',MATCH_FINISHED:'Match finished'},
    notices:{OUTBOUND_UNAVAILABLE:'The bookmaker could not be opened. Check the current slip odds.',ADDED:'Selection added',REPLACED:'Selection replaced',REMOVED:'Selection removed',CLEARED:'Slip cleared',UNCHANGED:'Selection is already on the slip',LIMIT:'You can add up to 10 selections.',EXPIRED:'These odds are no longer available.',
      RECOVERED:'The saved slip was recovered. Incompatible selections were removed.',UNSUPPORTED_VERSION:'This slip uses an incompatible version. You can start a new one.',STORAGE_UNAVAILABLE:'The browser could not save the slip. It will only stay on this page.',INVALID_STAKE:'Enter a valid positive amount.'}},
} satisfies Record<SlipUiLocale,{states:Record<SelectionState,string>;freshnessAgo:(n:number)=>string;[key:string]:unknown}>;
export function selectionLabel(s:CanonicalSelection,locale:SlipUiLocale,fixture?:ResolvedSelection['fixture']):string {
  if(s.market==='MATCH_WINNER'&&fixture){if(s.outcome==='HOME')return fixture.home;if(s.outcome==='AWAY')return fixture.away;}
  return slipCopy[locale].outcomes[s.outcome];
}
export function oddsFreshnessLabel(observedAt:string|null|undefined,now:number,locale:SlipUiLocale):string|null {
  if(!observedAt||!Number.isFinite(Date.parse(observedAt)))return null;
  const minutes=Math.max(0,Math.round((now-Date.parse(observedAt))/60000));
  return slipCopy[locale].freshnessAgo(minutes);
}
void sharedOutcomes;
