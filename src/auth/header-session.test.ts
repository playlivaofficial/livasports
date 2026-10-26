import {afterEach,describe,expect,it,vi} from 'vitest';
import {readHeaderSession} from './header-session';
afterEach(()=>vi.unstubAllGlobals());
describe('in-flight header session coalescing, not an auth cache',()=>{
 it('shares one private request between overlapping desktop/menu instances',async()=>{
  let resolve!:(value:Response)=>void;
  const fetcher=vi.fn(()=>new Promise<Response>(done=>{resolve=done;}));vi.stubGlobal('fetch',fetcher);
  const desktop=readHeaderSession(),menu=readHeaderSession();expect(menu).toBe(desktop);expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith('/api/auth/session',{credentials:'same-origin',cache:'no-store'});
  resolve(Response.json({user:{name:'Synthetic user'}}));expect(await Promise.all([desktop,menu])).toEqual([{user:{name:'Synthetic user'}},{user:{name:'Synthetic user'}}]);
 });
 it('never retains a completed user session for a subsequent read',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({user:{name:'Synthetic prior user'}})).mockResolvedValueOnce(Response.json(null));vi.stubGlobal('fetch',fetcher);
  expect(await readHeaderSession()).toEqual({user:{name:'Synthetic prior user'}});expect(await readHeaderSession()).toBeNull();expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('does not retain an anonymous response after sign-in',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json(null)).mockResolvedValueOnce(Response.json({user:{name:'Synthetic signed-in user'}}));vi.stubGlobal('fetch',fetcher);
  expect(await readHeaderSession()).toBeNull();expect(await readHeaderSession()).toEqual({user:{name:'Synthetic signed-in user'}});expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('clears unsuccessful HTTP responses without an automatic retry',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(null,{status:503})).mockResolvedValueOnce(Response.json(null));vi.stubGlobal('fetch',fetcher);
  expect(await readHeaderSession()).toBeNull();expect(fetcher).toHaveBeenCalledTimes(1);expect(await readHeaderSession()).toBeNull();expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it.each(['network','json'])('clears a %s failure for the next explicit caller',async failure=>{
  const fetcher=vi.fn();if(failure==='network')fetcher.mockRejectedValueOnce(Error('synthetic network failure'));else fetcher.mockResolvedValueOnce(new Response('invalid json'));
  fetcher.mockResolvedValueOnce(Response.json(null));vi.stubGlobal('fetch',fetcher);
  await expect(readHeaderSession()).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);expect(await readHeaderSession()).toBeNull();expect(fetcher).toHaveBeenCalledTimes(2);
 });
});
