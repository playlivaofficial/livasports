import {afterEach,describe,expect,it,vi} from 'vitest';
import {HttpSportmonksGateway} from '@/providers/sportmonks/HttpSportmonksGateway';
afterEach(()=>vi.unstubAllGlobals());
describe('backend score detail refresh',()=>{
  it('updates events and lineups through the same counted request, without an odds include',async()=>{
    const rows=[{id:42,season_id:123,league_id:8,events:[{id:9}],lineups:[]}];
    const transport=vi.fn(async(url:URL)=>{expect(url.protocol).toBe('https:');return Response.json({data:rows});});vi.stubGlobal('fetch',transport);
    const persist=vi.fn(async()=>{});const gateway=new HttpSportmonksGateway('unit-test',undefined,persist);
    expect(await gateway.scores(['42'])).toEqual(rows);expect(persist).toHaveBeenCalledWith(rows);
    const url=transport.mock.calls[0]?.[0] as unknown as URL;
    expect(url.searchParams.get('include')).toContain('events.type');expect(url.searchParams.get('include')).toContain('lineups.details.type');
    expect(url.searchParams.get('include')).not.toContain('odds');expect(gateway.requestCount()).toBe(1);
    await gateway.scores([]);expect(gateway.requestCount()).toBe(1);
  });
  it('propagates a persistence failure so the existing sync ledger records failure',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[{id:42}]})));
    const gateway=new HttpSportmonksGateway('unit-test',undefined,async()=>{throw Error('write failed');});
    await expect(gateway.scores(['42'])).rejects.toThrow('write failed');expect(gateway.requestCount()).toBe(1);
  });
  it('preserves the small score response for existing callers',async()=>{
    const transport=vi.fn(async(url:URL)=>{expect(url.protocol).toBe('https:');return Response.json({data:[]});});vi.stubGlobal('fetch',transport);
    await new HttpSportmonksGateway('unit-test').scores(['42']);
    const url=transport.mock.calls[0]?.[0] as unknown as URL;
    expect(url.searchParams.get('include')).toBe('participants;state;scores');
  });
});
