/** Shared class helpers for the owner health UI (usable from server and client components). */
export const stateClass=(state:string)=>`owner-health-state owner-health-state-${state.toLowerCase()}`;
export const cardClass=(state:string)=>`owner-health-card owner-health-state-${state.toLowerCase()}`;
