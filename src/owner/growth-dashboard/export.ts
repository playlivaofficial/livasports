import 'server-only';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {requestOwnerSession} from '@/owner/session';
import {readGrowthReport,readWeeklyScorecard} from '@/analytics/growth-report';
import {parseGrowthQuery,toLocalDay,withoutRange} from '@/analytics/growth-filters';
import {toCsv} from '@/analytics/growth-csv';
import {GROWTH_TABLES,SCORECARD_COLUMNS,scorecardRows} from './tables';

const privateHeaders={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
/** Owner-only CSV/JSON exports of the dashboard tables and the weekly snapshot. Same filters as the page. */
export async function growthDashboardExport(request:Request):Promise<Response>{
  if(!requestOwnerSession(request.headers))return Response.json({error:'UNAUTHORIZED'},{status:401,headers:privateHeaders});
  const url=new URL(request.url),table=url.searchParams.get('table')??'';
  if(!(table in GROWTH_TABLES)&&table!=='weekly'&&table!=='weekly-json')return Response.json({error:'UNKNOWN_TABLE'},{status:400,headers:privateHeaders});
  const connection=databaseUrl();if(!connection)return Response.json({error:'DATABASE_UNAVAILABLE'},{status:503,headers:privateHeaders});
  const parsed=parseGrowthQuery(Object.fromEntries(url.searchParams)),db=new PostgresDatabaseClient(connection,()=>undefined,{statementTimeoutMs:25_000});
  try{
    if(table==='weekly'||table==='weekly-json'){
      const card=await readWeeklyScorecard(db,parsed.week,withoutRange(parsed.filters)),name=`livasports-weekly-${toLocalDay(new Date(card.week.from))}`;
      if(table==='weekly-json'){
        return new Response(JSON.stringify({week:card.week,previousWeek:card.previousWeek,complete:card.complete,metrics:card.metrics,top:card.top,scored:card.scored,rules:card.rules,funnel:card.report.funnel,acquisition:card.report.acquisition,quality:card.report.quality},null,2),{headers:{...privateHeaders,'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="${name}.json"`}});}
      const metrics=toCsv(card.metrics,[{key:'metric',label:'Metric',value:row=>row.key},{key:'current',label:'This week',value:row=>row.current},{key:'previous',label:'Prior week',value:row=>row.previous},{key:'change',label:'Change',value:row=>row.change},{key:'pct',label:'Change %',value:row=>row.key==='bookmakerCtr'?null:row.changePct}]);
      const signals=toCsv(scorecardRows(card),SCORECARD_COLUMNS.map(column=>({key:column.key,label:column.label,value:(row:Record<string,string|number|null>)=>row[column.key]})));
      return new Response(`Week,${card.week.label}\r\n\r\n${metrics}\r\n${signals}`,{headers:{...privateHeaders,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${name}.csv"`}});
    }
    const definition=GROWTH_TABLES[table]!,report=await readGrowthReport(db,parsed.filters);
    const body=toCsv(definition.rows(report),definition.columns.map(column=>({key:column.key,label:column.label,value:(row:Record<string,string|number|null>)=>row[column.key]})));
    return new Response(body,{headers:{...privateHeaders,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="livasports-${table}-${toLocalDay(parsed.filters.from)}-${toLocalDay(new Date(parsed.filters.to.getTime()-1))}.csv"`}});
  }catch{return Response.json({error:'EXPORT_FAILED'},{status:503,headers:privateHeaders});}
  finally{await db.close();}
}
