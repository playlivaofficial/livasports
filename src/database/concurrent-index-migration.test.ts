import {describe,it,expect,vi} from 'vitest';
import type {QueryExecutor} from './client';
import {concurrentIndexMigration} from './concurrent-index-migration';
const sql='-- livasports:concurrent-indexes\nCREATE INDEX CONCURRENTLY IF NOT EXISTS test_idx ON test_table(player_id,observed_at DESC);';
describe('safe nonblocking index migrations',()=>{
  it('runs and verifies each additive index outside a transaction',async()=>{
    const query=vi.fn(async()=>({rows:[{indisvalid:true,indisready:true}]}));await concurrentIndexMigration({query:query as unknown as QueryExecutor['query']},sql);
    expect(query).toHaveBeenCalledTimes(3);expect(query.mock.calls.map(c=>(c as unknown[])[0]).join()).not.toMatch(/BEGIN|COMMIT|DELETE|DROP/);
  });
  it('refuses arbitrary statements and never guesses how to repair invalid indexes',async()=>{
    const query=vi.fn(async()=>({rows:[{indisvalid:false,indisready:false}]}));const db={query:query as unknown as QueryExecutor['query']};
    await expect(concurrentIndexMigration(db,sql+' DELETE FROM users;')).rejects.toThrow('INVALID_CONCURRENT');expect(query).not.toHaveBeenCalled();
    await expect(concurrentIndexMigration(db,sql)).rejects.toThrow('OPERATOR_REVIEW');expect(query).toHaveBeenCalledTimes(1);
  });
});
