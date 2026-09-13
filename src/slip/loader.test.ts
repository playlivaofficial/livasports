import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {SlipLoader} from './loader';
import {readPublicOddsFixtures} from '@/odds/read-repository';
import {SLIP_SCOPE,type CanonicalSelection} from './types';
const pick:CanonicalSelection={fixturePublicId:'1111111111111111',scope:SLIP_SCOPE,market:'MATCH_WINNER',outcome:'HOME',line:null};
describe('bounded DB/cache-only slip reads',()=>{
  it('batches ten cold fixtures once, hits cache, and partitions locale',async()=>{
    const fetch=vi.spyOn(globalThis,'fetch');let now=1000;const read=vi.fn().mockResolvedValue(new Map());const loader=new SlipLoader(read,()=>now);
    const picks=Array.from({length:10},(_,i)=>({...pick,fixturePublicId:i.toString(16).padStart(16,'0')}));
    expect((await loader.resolve(picks,'br','BR')).selections).toHaveLength(10);expect(read).toHaveBeenCalledTimes(1);
    await loader.resolve(picks,'br','BR');expect(read).toHaveBeenCalledTimes(1);await loader.resolve(picks,'mx','MX');expect(read).toHaveBeenCalledTimes(2);
    now+=15000;await loader.resolve(picks,'br','BR');expect(read).toHaveBeenCalledTimes(3);expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
  });
  it('does not fetch for empty intent or accept excess/duplicate selections',async()=>{
    const read=vi.fn();const loader=new SlipLoader(read);expect((await loader.resolve([],'br')).providerRequests).toBe(0);expect(read).not.toHaveBeenCalled();
    await expect(loader.resolve([pick,pick],'br')).rejects.toThrow('INVALID_SLIP');
  });
  it('never supplies an expired cache as fallback after database failure',async()=>{
    let now=0;const read=vi.fn().mockResolvedValueOnce(new Map()).mockRejectedValueOnce(new Error('offline'));const loader=new SlipLoader(read,()=>now);
    await loader.resolve([pick],'br');now=15001;await expect(loader.resolve([pick],'br')).rejects.toThrow('offline');
  });
  it('uses one parameterized query with the same M5 mapping/GEO safeguards and no public destinations',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[]});await readPublicOddsFixtures({query},[pick.fixturePublicId],'MX');
    expect(query).toHaveBeenCalledTimes(1);const [sql,args]=query.mock.calls[0];
    expect(sql).toContain('f.public_id=ANY($1::text[])');expect(sql).toContain('LIMIT 500');expect(sql).toContain('mapping_verified');expect(sql).toContain('verification_state');
    expect(args).toEqual([[pick.fixturePublicId],'MX']);
  });
});
