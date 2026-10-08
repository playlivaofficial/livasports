import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Children,isValidElement,type ReactNode} from 'react';
const f=vi.hoisted(()=>({fetch:vi.fn(),assign:vi.fn(),reload:vi.fn(),setState:vi.fn()}));
vi.mock('react',async importOriginal=>({
  ...await importOriginal<typeof import('react')>(),useState:(initial:unknown)=>[initial,f.setState],useEffect:()=>{},
}));
import {OwnerPreviewBar,geoForRoute,previewRouteMismatch} from './PreviewControls';

describe('preview GEO and route stay in step',()=>{
  it('reads the jurisdiction from the route prefix only',()=>{
    expect(geoForRoute('/mx')).toBe('MX');
    expect(geoForRoute('/co/partido/x-y-0000000000000001')).toBe('CO');
    expect(geoForRoute('/pe/futbol')).toBe('PE');
    for(const path of ['/','/br','/en/match/x','/owner/preview','/mxn','/peru'])expect(geoForRoute(path)).toBeNull();
  });
  it('flags a Peruvian route under a Colombian preview, the reported production state',()=>{
    expect(previewRouteMismatch('/pe',true,'CO')).toBe('PE');
    expect(previewRouteMismatch('/mx/futbol',true,'CO')).toBe('MX');
  });
  it('is silent when route and preview agree, without a preview, and off the core routes',()=>{
    expect(previewRouteMismatch('/co/futbol',true,'CO')).toBeNull();
    expect(previewRouteMismatch('/pe',false,null)).toBeNull();
    expect(previewRouteMismatch('/pe',true,null)).toBeNull();
    expect(previewRouteMismatch('/en',true,'CO')).toBeNull();
    expect(previewRouteMismatch('/owner/commercial',true,'PE')).toBeNull();
  });
});

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
  it.each(['MX','CO','PE'] as const)('fully reloads the %s document, including same-locale CO navigation',async geo=>{
    const change=changeHandler(OwnerPreviewBar({preview:false,previewGeo:null}));
    expect(change).toBeTypeOf('function');
    await change!({target:{value:geo}});
    expect(f.fetch).toHaveBeenCalledWith('/api/owner/preview',expect.objectContaining({method:'POST',cache:'no-store',body:JSON.stringify({action:'preview',geo})}));
    expect(f.assign).toHaveBeenCalledExactlyOnceWith(`/${geo.toLowerCase()}`);
    expect(f.reload).not.toHaveBeenCalled();
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
    expect(f.assign).toHaveBeenCalledExactlyOnceWith('/co');
  });
  it('retains the existing failure state and does not navigate on denied preview changes',async()=>{
    f.fetch.mockResolvedValue(new Response(null,{status:401}));
    await changeHandler(OwnerPreviewBar({preview:false}))!({target:{value:'CO'}});
    expect(f.assign).not.toHaveBeenCalled();expect(f.reload).not.toHaveBeenCalled();
    expect(f.setState).toHaveBeenCalledWith('Open owner controls to sign in again.');
    expect(f.setState).toHaveBeenLastCalledWith(false);
  });
});
