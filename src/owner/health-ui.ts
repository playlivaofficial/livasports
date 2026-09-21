/** Shared class helpers for the owner health UI (usable from server and client components). */
export const stateClass=(state:string)=>`owner-health-state owner-health-state-${state.toLowerCase()}`;
export const cardClass=(state:string)=>`owner-health-card owner-health-state-${state.toLowerCase()}`;
export function healthRelativeTime(generatedAt:string){
  const at=Date.parse(generatedAt);
  return {
    ago:(iso:string|null)=>{if(!iso)return '—';const m=Math.round((at-Date.parse(iso))/60000);return m<60?`${m} min ago`:m<1440?`${Math.round(m/60)} h ago`:`${Math.round(m/1440)} d ago`;},
    until:(iso:string|null)=>{if(!iso)return '—';const h=(Date.parse(iso)-at)/3600000;return h<1?`${Math.max(0,Math.round(h*60))} min`:h<48?`${h.toFixed(1)} h`:`${Math.round(h/24)} d`;},
  };
}
