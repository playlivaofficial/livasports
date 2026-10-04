/** A new monitoring inventory must never reuse the identity of a historical incident. */
export const CORE_GLOBAL_INCIDENT='CORE_GEO:*';
export function incidentScopeLabel(scope:string):string {
  return scope===CORE_GLOBAL_INCIDENT?'MX / CO / PE platform':scope==='*'?'platform':scope;
}
export function incidentScopeHref(scope:string):string|null {
  return /^(MX|CO|PE):[a-z0-9][a-z0-9-]{0,99}$/.test(scope)?`/owner/health/${scope}`:null;
}
