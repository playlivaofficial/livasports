import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({owner:vi.fn(),withRepo:vi.fn(),evidence:vi.fn()}));
vi.mock('@/owner/session',()=>({requestOwnerSession:mocks.owner}));
vi.mock('./server',()=>({withAutomation:mocks.withRepo}));
import {GET} from '@/app/api/owner/news/evidence/route';
beforeEach(()=>{vi.clearAllMocks();mocks.owner.mockReturnValue(true);mocks.evidence.mockResolvedValue([]);mocks.withRepo.mockImplementation(work=>work({reviewEvidence:mocks.evidence}));});
describe('private rejected-copy access',()=>{
 it('blocks anonymous access before reading evidence',async()=>{mocks.owner.mockReturnValue(false);expect((await GET(new Request('https://test/api/owner/news/evidence'))).status).toBe(401);expect(mocks.evidence).not.toHaveBeenCalled();});
 it('returns authenticated evidence with no-store and noindex',async()=>{const r=await GET(new Request('https://test/api/owner/news/evidence'));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(r.headers.get('x-robots-tag')).toContain('noindex');expect(await r.json()).toEqual({retentionDays:7,evidence:[]});});
 it('never exposes database errors or private configuration',async()=>{mocks.withRepo.mockRejectedValue(Error('private-db-credential'));const r=await GET(new Request('https://test/api/owner/news/evidence'));expect(r.status).toBe(503);expect(await r.text()).not.toContain('private-db-credential');});
});
