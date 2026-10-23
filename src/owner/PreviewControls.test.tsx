import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Children,isValidElement,type ReactNode} from 'react';
const f=vi.hoisted(()=>({fetch:vi.fn(),assign:vi.fn(),reload:vi.fn(),setState:vi.fn()}));
vi.mock('react',async importOriginal=>({
  ...await importOriginal<typeof import('react')>(),useState:(initial:unknown)=>[initial,f.setState],useEffect:()=>{},
}));
import {OwnerPreviewBar} from './PreviewControls';

type Change=(event:{target:{value:string}})=>Promise<void>;
function changeHandler(node:ReactNode):Change|undefined{
  for(const child of Children.toArray(node)){
    if(!isValidElement<{children?:ReactNode;onChange?:Change}>(child))continue;
    if(child.type==='select')return child.props.onChange;
    const nested=changeHandler(child.props.children);if(nested)return nested;
  }
}
beforeEach(()=>{
  vi.clearAllMocks();
  vi.stubGlobal('fetch',f.fetch);
  vi.stubGlobal('window',{location:{pathname:'/co/partido/current-fixture',assign:f.assign,reload:f.reload}});
  f.fetch.mockResolvedValue(new Response(null,{status:200}));
});
afterEach(()=>vi.unstubAllGlobals());

describe('owner preview after cached public-root hydration',()=>{
  it.each(['MX','CO','PE'] as const)('updates %s without changing the current language or article route',async geo=>{
    const change=changeHandler(OwnerPreviewBar({preview:false,previewGeo:null}));
    expect(change).toBeTypeOf('function');
    await change!({target:{value:geo}});
    expect(f.fetch).toHaveBeenCalledWith('/api/owner/preview',expect.objectContaining({method:'POST',cache:'no-store',body:JSON.stringify({action:'preview',geo})}));
    expect(f.assign).not.toHaveBeenCalled();
    expect(f.reload).toHaveBeenCalledTimes(1);
  });
  it('preserves the full-document reset to real GEO',async()=>{
    await changeHandler(OwnerPreviewBar({preview:true,previewGeo:'CO'}))!({target:{value:''}});
    expect(f.fetch).toHaveBeenCalledWith('/api/owner/preview',expect.objectContaining({body:JSON.stringify({action:'preview',geo:null})}));
    expect(f.reload).toHaveBeenCalledTimes(1);expect(f.assign).not.toHaveBeenCalled();
  });
  it('does not navigate until the signed session change succeeds',async()=>{
    let finish!:(response:Response)=>void;
    f.fetch.mockReturnValue(new Promise<Response>(resolve=>{finish=resolve;}));
    const pending=changeHandler(OwnerPreviewBar({preview:false}))!({target:{value:'CO'}});
    expect(f.assign).not.toHaveBeenCalled();expect(f.reload).not.toHaveBeenCalled();
    finish(new Response(null,{status:200}));await pending;
    expect(f.assign).not.toHaveBeenCalled();expect(f.reload).toHaveBeenCalledTimes(1);
  });
  it('retains the existing failure state and does not navigate on denied preview changes',async()=>{
    f.fetch.mockResolvedValue(new Response(null,{status:401}));
    await changeHandler(OwnerPreviewBar({preview:false}))!({target:{value:'CO'}});
    expect(f.assign).not.toHaveBeenCalled();expect(f.reload).not.toHaveBeenCalled();
    expect(f.setState).toHaveBeenCalledWith('Open owner controls to sign in again.');
    expect(f.setState).toHaveBeenLastCalledWith(false);
  });
  it.each(['/mx','/co','/pe','/en/news/story','/br/noticias/story'])('never rewrites the signed preview merely by opening %s',path=>{
    window.location.pathname=path;
    const bar=OwnerPreviewBar({preview:true,previewGeo:'PE'});
    expect(bar.props['data-preview-geo']).toBe('PE');
    expect(bar.props['data-route-mismatch']).toBeUndefined();
    expect(f.fetch).not.toHaveBeenCalled();expect(f.assign).not.toHaveBeenCalled();expect(f.reload).not.toHaveBeenCalled();
  });
});
