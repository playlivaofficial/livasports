/** Public-to-Owner summary only; no raw model payloads or credentials are accepted. */
export function executionSummary(value:unknown){
  const run=value as {status?:unknown;result?:{generation?:unknown;modelUsage?:{calls?:number;stages?:Record<string,{microUsd?:number}>}}}|null;
  const usage=run?.result?.modelUsage,calls=Number.isSafeInteger(usage?.calls)?Math.max(0,usage!.calls!):0;
  const reported=Object.values(usage?.stages??{}).filter(s=>typeof s?.microUsd==='number'&&Number.isFinite(s.microUsd)).length;
  const failed=typeof run?.result?.generation==='string'&&run.result.generation.startsWith('MODEL_')&&calls>0;
  return {calls,reported,unknown:Math.max(0,calls-reported),status:failed?'Model failed — no publication':String(run?.status??'Unknown')};
}
