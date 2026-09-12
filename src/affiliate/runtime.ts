import 'server-only';
import {Pool,type QueryResultRow} from 'pg';
import {databaseUrl,type QueryExecutor} from '@/database/client';
import {offerDependencies} from './service';
let pool:Pool|null=null;
// Dedicated bounded pool prevents optional commercial analytics from consuming
// the sports read pool or holding a redirect open for its default DB timeout.
export function affiliateDatabase():QueryExecutor {
  const connectionString=databaseUrl();if(!connectionString)throw Error('AFFILIATE_DATABASE_UNAVAILABLE');
  pool??=new Pool({connectionString,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:1200,statement_timeout:1200,query_timeout:1500});
  const p=pool;return {query:<Row extends QueryResultRow=QueryResultRow>(text:string,values?:readonly unknown[])=>p.query<Row>(text,values as unknown[]|undefined)};
}
export function runtimeDependencies(){return offerDependencies(affiliateDatabase());}
