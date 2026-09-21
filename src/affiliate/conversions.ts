// Contract only. No approved Betsson postback/signature/sub-ID specification or
// credentials are configured. Do not add a receiver or infer a conversion.
export const POSTBACK_OPERATIONAL=false as const;
export interface OperatorConversionEvidence {
  bookmaker:import('@/odds/registry').BookmakerId;operatorEventId:string;clickId:string|null;
  eventType:'REGISTRATION'|'FTD'|'QUALIFIED_FTD'|'REVENUE_EVENT';occurredAt:string;
  sourceReference:string;verificationReference:string;
  currency:string|null;reportedRevenue:string|null;reportedCommission:string|null;
}
export function receiveOperatorConversion():never {throw new Error('POSTBACK_NOT_CONFIGURED');}
