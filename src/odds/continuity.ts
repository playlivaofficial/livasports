import type {QueryExecutor} from '@/database/client';
import type {NativeCell} from './native-coverage';
export interface ContinuitySample {at:string;cells:NativeCell[];}
/** Observed selection-time, not invented history. Gaps over 15 minutes are excluded. */
export function continuityMetrics(samples:readonly ContinuitySample[]){
 const groups=new Map<string,{key:string;observedSeconds:number;nativeSeconds:number;fallbackSeconds:number;nativeToFallback:number;recoveries:number;expiryMisses:number;nativeIntervals:number;retainedNativeIntervals:number}>();
 const sorted=[...samples].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const id=(c:NativeCell)=>[c.fixtureId,c.bookmaker,c.market,c.outcome].join('|');
 for(let i=1;i<sorted.length;i++){
  const previous=sorted[i-1],current=sorted[i],seconds=(Date.parse(current.at)-Date.parse(previous.at))/1000;
  if(seconds<=0||seconds>900)continue;
  const prior=new Map(previous.cells.map(c=>[id(c),c]));
  for(const c of current.cells){const p=prior.get(id(c));if(!p)continue;
   for(const key of new Set(['*',[c.bookmaker,'*','*','*'].join('|'),[c.bookmaker,c.competition,c.market,c.window].join('|'),
    [c.bookmaker,c.competition,'*','*'].join('|'),[c.bookmaker,'*',c.market,'*'].join('|'),[c.bookmaker,'*','*',c.window].join('|')])){
    const g=groups.get(key)??{key,observedSeconds:0,nativeSeconds:0,fallbackSeconds:0,nativeToFallback:0,recoveries:0,expiryMisses:0,nativeIntervals:0,retainedNativeIntervals:0};
    g.observedSeconds+=seconds;
    if(p.kind==='REAL'){
      g.nativeIntervals++;if(c.kind==='REAL')g.retainedNativeIntervals++;
      // Do not count the known expired tail as native time when the next observation is non-native.
      const expiry=Date.parse(p.nativeExpiryAt??'');
      g.nativeSeconds+=c.kind!=='REAL'&&Number.isFinite(expiry)?Math.max(0,Math.min(seconds,(expiry-Date.parse(previous.at))/1000)):seconds;
    }
    if(p.kind==='PROXY')g.fallbackSeconds+=seconds;
    if(p.kind==='REAL'&&c.kind==='PROXY')g.nativeToFallback++;
    if(p.kind==='PROXY'&&c.kind==='REAL')g.recoveries++;
    if(p.kind==='REAL'&&c.kind!=='REAL'&&c.reason==='STALE_OR_EXPIRED')g.expiryMisses++;
    groups.set(key,g);
   }
  }
 }
 return [...groups.values()].map(g=>({...g,nativeContinuityPct:g.observedSeconds?100*g.nativeSeconds/g.observedSeconds:null,
  nativeRetentionPct:g.nativeIntervals?100*g.retainedNativeIntervals/g.nativeIntervals:null,
  fallbackPct:g.observedSeconds?100*g.fallbackSeconds/g.observedSeconds:null}));
}
export async function recordContinuity(db:QueryExecutor,at:string,cells:NativeCell[]){
 const bucket=new Date(Math.floor(Date.parse(at)/300000)*300000).toISOString();
 await db.query(`INSERT INTO odds_continuity_samples(bucket,observed_at,cells) VALUES($1,$2,$3::jsonb) ON CONFLICT(bucket) DO NOTHING`,[bucket,at,JSON.stringify(cells)]);
 const pair=await db.query('SELECT observed_at,cells FROM odds_continuity_samples WHERE bucket<=$1 ORDER BY bucket DESC LIMIT 2',[bucket]);
 const metrics=continuityMetrics(pair.rows.map(r=>({at:new Date(r.observed_at).toISOString(),cells:r.cells as NativeCell[]})));
 await db.query('INSERT INTO odds_continuity_rollups(bucket,metrics) VALUES($1,$2::jsonb) ON CONFLICT(bucket) DO NOTHING',[bucket,JSON.stringify(metrics)]);
 await db.query("DELETE FROM odds_continuity_samples WHERE bucket<now()-interval '7 days'");
 await db.query("DELETE FROM odds_scheduler_decisions WHERE at<now()-interval '7 days'");
}
export function combineContinuity(groups:ReturnType<typeof continuityMetrics>){
 const sums=new Map<string,typeof groups[number]>();
 for(const g of groups){const prior=sums.get(g.key);if(!prior){sums.set(g.key,{...g});continue;}
  for(const key of ['observedSeconds','nativeSeconds','fallbackSeconds','nativeToFallback','recoveries','expiryMisses','nativeIntervals','retainedNativeIntervals'] as const)prior[key]+=g[key];
 }
 return [...sums.values()].map(g=>({...g,nativeContinuityPct:g.observedSeconds?100*g.nativeSeconds/g.observedSeconds:null,
  nativeRetentionPct:g.nativeIntervals?100*g.retainedNativeIntervals/g.nativeIntervals:null,fallbackPct:g.observedSeconds?100*g.fallbackSeconds/g.observedSeconds:null}));
}
export async function readContinuity(db:QueryExecutor){
 const rows=await db.query("SELECT s.observed_at,r.metrics FROM odds_continuity_samples s LEFT JOIN odds_continuity_rollups r USING(bucket) WHERE s.bucket>now()-interval '24 hours' ORDER BY s.bucket");
 const decisions=await db.query('SELECT at,targets,budget FROM odds_scheduler_decisions ORDER BY at DESC LIMIT 1');
 const rescue=await db.query("SELECT outcome,count(*)::int AS count FROM odds_recovery_actions WHERE action='NATIVE_RESCUE' AND at>now()-interval '24 hours' GROUP BY outcome");
 const samples=rows.rows.map(r=>({at:new Date(r.observed_at).toISOString(),metrics:(r.metrics??[]) as ReturnType<typeof continuityMetrics>}));
 const attempts=rescue.rows.reduce((n,r)=>n+Number(r.count),0),success=rescue.rows.filter(r=>r.outcome==='SUCCEEDED').reduce((n,r)=>n+Number(r.count),0);
 const latestTargets=(decisions.rows[0]?.targets??[]) as Array<{bookmaker:string;rescue:boolean;decision:string}>;
 const deferrals:Record<string,number>={};for(const t of latestTargets)deferrals[t.decision]=(deferrals[t.decision]??0)+1;
 return {samples:samples.length,from:samples[0]?.at??null,to:samples.at(-1)?.at??null,groups:combineContinuity(samples.flatMap(s=>s.metrics)),
  latestDecision:decisions.rows[0]??null,deferrals,rescueQueue:latestTargets.filter(t=>t.rescue&&t.decision!=='REFRESHED'),
  rescue:{attempts,success,successPct:attempts?100*success/attempts:null,outcomes:rescue.rows},providerRequests:0};
}
