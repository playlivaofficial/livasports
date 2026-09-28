import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/owner/session',()=>({requestOwnerSession:vi.fn(()=>({id:'owner'}))}));
vi.mock('@/database/client',()=>({databaseUrl:()=> 'test-only',PostgresDatabaseClient:class{close=vi.fn();}}));
vi.mock('./repository',()=>({readGrowthItem:vi.fn(),readGrowthVideo:vi.fn()}));
vi.mock('./manual-repository',()=>({isLatestGrowthItem:vi.fn(async()=>true)}));
import {GET} from '@/app/api/owner/growth/items/[id]/video/[channel]/route';
import {requestOwnerSession} from '@/owner/session';
import {readGrowthItem,readGrowthVideo} from './repository';
import {isLatestGrowthItem} from './manual-repository';
import {publishingItem} from './manual.test-support';
import {currentVideoUrl} from './manual-publishing';
beforeEach(()=>{vi.clearAllMocks();vi.mocked(requestOwnerSession).mockReturnValue({id:'owner'} as never);vi.mocked(isLatestGrowthItem).mockResolvedValue(true);});
describe('exact owner video download',()=>{
  it('blocks legacy betting video even when current=1 is omitted',async()=>{
    const item=publishingItem();item.content.assetModel='MASTER_V1';vi.mocked(readGrowthItem).mockResolvedValue(item);
    const response=await GET(new Request(`https://livasports.com/api/owner/growth/items/${item.id}/video/TIKTOK?download=1`),{params:Promise.resolve({id:item.id,channel:'TIKTOK'})});
    expect(response.status).toBe(409);expect(readGrowthVideo).not.toHaveBeenCalled();
  });
  it('returns useful platform filename, MP4 attachment and matching content hash',async()=>{
    const item=publishingItem();vi.mocked(readGrowthItem).mockResolvedValue(item);
    vi.mocked(readGrowthVideo).mockResolvedValue({data:Buffer.from('mp4!'),mimeType:'video/mp4',sha256:'a'.repeat(64),byteLength:4,renderMetadata:undefined});
    const response=await GET(new Request('https://livasports.com'+currentVideoUrl(item,'TIKTOK',true)),{params:Promise.resolve({id:item.id,channel:'TIKTOK'})});
    expect(response.status).toBe(200);expect(response.headers.get('content-disposition')).toContain('attachment; filename="livasports_tiktok_flamengo-vs-mirassol_2026-09-22_r2.mp4"');
    expect(response.headers.get('content-type')).toBe('video/mp4');expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('etag')).toBe('"'+'a'.repeat(64)+'"');
  });
  it('rejects an old primary link after a newer revision appears and blocks anonymous reads',async()=>{
    const item=publishingItem();vi.mocked(readGrowthItem).mockResolvedValue(item);vi.mocked(isLatestGrowthItem).mockResolvedValue(false);
    const request=new Request('https://livasports.com'+currentVideoUrl(item,'TIKTOK',true)),params={params:Promise.resolve({id:item.id,channel:'TIKTOK'})};
    expect((await GET(request,params)).status).toBe(409);expect(readGrowthVideo).not.toHaveBeenCalled();
    vi.mocked(requestOwnerSession).mockReturnValue(null);expect((await GET(request,params)).status).toBe(401);
  });
});
