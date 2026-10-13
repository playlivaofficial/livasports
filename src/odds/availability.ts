import type {InterfaceLocale} from '@/localization/interface';

export type OddsAvailability='AVAILABLE'|'LOADING'|'NOT_OFFERED'|'STALE'|'SUSPENDED'|'CLOSED'|'INGESTION_DELAY'|'PROVIDER_ERROR'|'QUOTA_DELAY'|'UNVERIFIED';
export function pipelineAvailability(input:{error?:string|null;outcome?:string|null;providerError?:boolean;quotaBlocked?:boolean;confirmedGap?:boolean}):OddsAvailability{
  if(input.providerError||(input.error&&/HTTP_(?:401|403|429|5\d\d)|NETWORK|TIMEOUT/.test(input.error)))return 'PROVIDER_ERROR';
  if(input.outcome==='MAPPING_EMPTY'||input.outcome==='PARSER_EMPTY'||input.error==='ODDS_IDENTITY_CONFLICT')return 'INGESTION_DELAY';
  if(input.quotaBlocked)return 'QUOTA_DELAY';
  return input.confirmedGap?'NOT_OFFERED':'UNVERIFIED';
}
const labels={
  en:{AVAILABLE:'Current odds',LOADING:'Loading odds…',NOT_OFFERED:'Not offered in the latest bookmaker feed.',STALE:'Odds are out of date — waiting for a new check.',SUSPENDED:'Market temporarily suspended.',CLOSED:'Pregame odds are no longer available.',INGESTION_DELAY:'Odds verification is delayed. Please check again shortly.',PROVIDER_ERROR:'The odds service is temporarily unavailable. Saved prices retain their expiry.',QUOTA_DELAY:'Odds refresh is delayed. Expired prices cannot be selected.',UNVERIFIED:'No verified current price is available yet.'},
  br:{AVAILABLE:'Odds atuais',LOADING:'Carregando odds…',NOT_OFFERED:'Não oferecida no último feed da casa.',STALE:'Odds desatualizadas — aguardando nova verificação.',SUSPENDED:'Mercado temporariamente suspenso.',CLOSED:'As odds pré-jogo não estão mais disponíveis.',INGESTION_DELAY:'A verificação das odds está atrasada. Tente novamente em breve.',PROVIDER_ERROR:'O serviço de odds está temporariamente indisponível. Os preços salvos mantêm sua validade.',QUOTA_DELAY:'A atualização das odds está atrasada. Preços vencidos não podem ser selecionados.',UNVERIFIED:'Ainda não há preço atual verificado.'},
  mx:{AVAILABLE:'Cuotas actuales',LOADING:'Cargando cuotas…',NOT_OFFERED:'No ofrecida en el último feed de la casa.',STALE:'Cuotas desactualizadas — pendientes de verificación.',SUSPENDED:'Mercado suspendido temporalmente.',CLOSED:'Las cuotas prepartido ya no están disponibles.',INGESTION_DELAY:'La verificación de cuotas está demorada. Vuelve a consultar en breve.',PROVIDER_ERROR:'El servicio de cuotas no está disponible temporalmente. Los precios guardados mantienen su vencimiento.',QUOTA_DELAY:'La actualización de cuotas está demorada. No se pueden seleccionar precios vencidos.',UNVERIFIED:'Aún no hay un precio actual verificado.'},
} as const;
export function oddsAvailabilityLabel(locale:InterfaceLocale,state:OddsAvailability){return labels[locale==='en'?'en':locale==='br'?'br':'mx'][state];}
