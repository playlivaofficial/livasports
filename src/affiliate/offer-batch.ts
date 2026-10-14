import type {CommercialContext} from './types';

/** Respect the existing server's 16 KiB / 16-context boundary, including signed slip receipts. */
export function offerBatchSize(contexts:readonly CommercialContext[]):number {
  let bytes=2,count=0;
  for(const context of contexts.slice(0,16)){
    const next=new TextEncoder().encode(JSON.stringify(context)).byteLength+(count?1:0);
    if(bytes+next>16384)break;
    bytes+=next;count++;
  }
  return count;
}
