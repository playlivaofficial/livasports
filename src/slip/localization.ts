import type {SiteLocale} from '@/config/i18n';
import type {CanonicalSelection,ResolvedSelection,SelectionState} from './types';

export const slipCopy={
  br:{title:'Meu bilhete',selections:'seleções',selection:'seleção',close:'Fechar bilhete',remove:'Remover',clear:'Limpar tudo',clearQuestion:'Remover todas as seleções?',
    confirmClear:'Sim, limpar',cancel:'Cancelar',replace:'Substituir seleção',replaceQuestion:'Já existe uma seleção desta partida no bilhete.',replaceWith:'Nova seleção',
    emptyTitle:'Seu próximo palpite começa aqui',empty:'Toque em uma odd disponível nas partidas para montar seu bilhete.',browse:'Explorar partidas',
    disclaimer:'Apenas planejamento. Nenhuma aposta foi realizada.',local:'Salvo somente neste navegador. Sem cadastro.',
    reference:'Referência atual',best:'Melhor odd atual observada',single:'Uma casa elegível',checking:'Verificando odds…',offline:'Sem conexão. Suas seleções continuam salvas.',
    retry:'Não foi possível verificar as odds agora. Suas seleções foram mantidas.',geo:'Sem odds atuais verificadas para este país.',missing:'Partida indisponível',
    updated:'Consulta ao LivaSports',currentCount:'com odds atuais',scope:'Pré-jogo · 90 minutos',add:'Adicionar ao bilhete',selected:'No bilhete',
    markets:{MATCH_WINNER:'Resultado final',TOTAL_GOALS:'Total de gols · 2,5',BTTS:'Ambas marcam'},
    outcomes:{HOME:'Mandante',DRAW:'Empate',AWAY:'Visitante',OVER:'Mais de 2,5',UNDER:'Menos de 2,5',YES:'Sim',NO:'Não'},
    states:{CURRENT:'Odd atual',PRICE_CHANGED:'Odd atualizada',STALE:'Odd desatualizada',UNAVAILABLE:'Odd indisponível',SUSPENDED:'Mercado suspenso',CLOSED:'Mercado encerrado',MATCH_STARTED:'Partida iniciada',MATCH_FINISHED:'Partida encerrada'},
    notices:{ADDED:'Seleção adicionada',REPLACED:'Seleção substituída',REMOVED:'Seleção removida',CLEARED:'Bilhete limpo',UNCHANGED:'Seleção já está no bilhete',LIMIT:'Você pode adicionar até 10 seleções.',EXPIRED:'Esta odd não está mais disponível.',
      RECOVERED:'O bilhete salvo foi recuperado. Seleções incompatíveis foram removidas.',UNSUPPORTED_VERSION:'Este bilhete usa uma versão não compatível. Você pode começar um novo.',STORAGE_UNAVAILABLE:'Não foi possível salvar no navegador. O bilhete ficará disponível somente nesta página.'}},
  mx:{title:'Mi boleto',selections:'selecciones',selection:'selección',close:'Cerrar boleto',remove:'Quitar',clear:'Borrar todo',clearQuestion:'¿Quitar todas las selecciones?',
    confirmClear:'Sí, borrar',cancel:'Cancelar',replace:'Reemplazar selección',replaceQuestion:'Ya tienes una selección de este partido en el boleto.',replaceWith:'Nueva selección',
    emptyTitle:'Tu próximo pronóstico empieza aquí',empty:'Toca una cuota disponible en los partidos para armar tu boleto.',browse:'Explorar partidos',
    disclaimer:'Solo para planificar. No se ha realizado ninguna apuesta.',local:'Guardado solo en este navegador. Sin registro.',
    reference:'Referencia actual',best:'Mejor cuota actual observada',single:'Una casa elegible',checking:'Verificando cuotas…',offline:'Sin conexión. Tus selecciones siguen guardadas.',
    retry:'No fue posible verificar las cuotas. Conservamos tus selecciones.',geo:'No hay cuotas actuales verificadas para este país.',missing:'Partido no disponible',
    updated:'Consulta a LivaSports',currentCount:'con cuotas actuales',scope:'Prepartido · 90 minutos',add:'Agregar al boleto',selected:'En el boleto',
    markets:{MATCH_WINNER:'Resultado final',TOTAL_GOALS:'Total de goles · 2.5',BTTS:'Ambos anotan'},
    outcomes:{HOME:'Local',DRAW:'Empate',AWAY:'Visitante',OVER:'Más de 2.5',UNDER:'Menos de 2.5',YES:'Sí',NO:'No'},
    states:{CURRENT:'Cuota actual',PRICE_CHANGED:'Cuota actualizada',STALE:'Cuota desactualizada',UNAVAILABLE:'Cuota no disponible',SUSPENDED:'Mercado suspendido',CLOSED:'Mercado cerrado',MATCH_STARTED:'Partido iniciado',MATCH_FINISHED:'Partido finalizado'},
    notices:{ADDED:'Selección agregada',REPLACED:'Selección reemplazada',REMOVED:'Selección eliminada',CLEARED:'Boleto vacío',UNCHANGED:'La selección ya está en tu boleto',LIMIT:'Puedes agregar hasta 10 selecciones.',EXPIRED:'Esta cuota ya no está disponible.',
      RECOVERED:'Se recuperó tu boleto. Se quitaron las selecciones incompatibles.',UNSUPPORTED_VERSION:'Este boleto usa una versión no compatible. Puedes empezar uno nuevo.',STORAGE_UNAVAILABLE:'No se pudo guardar en el navegador. El boleto solo estará disponible en esta página.'}},
} satisfies Record<SiteLocale,{states:Record<SelectionState,string>;[key:string]:unknown}>;
export function selectionLabel(s:CanonicalSelection,locale:SiteLocale,fixture?:ResolvedSelection['fixture']):string {
  if(s.market==='MATCH_WINNER'&&fixture){if(s.outcome==='HOME')return fixture.home;if(s.outcome==='AWAY')return fixture.away;}
  return slipCopy[locale].outcomes[s.outcome];
}
