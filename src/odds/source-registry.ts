export interface NativeSourceRegistration {id:string;priority:number;enabled:boolean;}
/** A future supplier is inert until reviewed and explicitly enabled here. */
export const NATIVE_SOURCE_REGISTRY:readonly NativeSourceRegistration[]=[
  {id:'ODDSPAPI',priority:10,enabled:true},
] as const;
export const APPROVED_NATIVE_SOURCE_IDS=NATIVE_SOURCE_REGISTRY.filter(source=>source.enabled).sort((a,b)=>a.priority-b.priority).map(source=>source.id);
