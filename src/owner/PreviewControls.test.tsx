import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Children,isValidElement,type ReactNode} from 'react';
import {CORE_GEOS,geoProfile} from '@/config/geo';
const f=vi.hoisted(()=>({fetch:vi.fn(),assign:vi.fn(),reload:vi.fn(),setState:vi.fn(),effects:[] as Array<()=>unknown>}));
vi.mock('react',async importOriginal=>({
  ...await importOriginal<typeof import('react')>(),useState:(initial:unknown)=>[initial,f.setState],
  // Run mounted effects so an automatic route-driven POST cannot hide behind a no-op mock.
  useEffect:(effect:()=>unknown)=>{f.effects.push(effect);},
}));
import {OwnerPreviewBar,PreviewControls} from './PreviewControls';

type Change=(event:{target:{value:string}})=>Promise<void>;
type Click=()=>Promise<void>;
function changeHandler(node:ReactNode):Change|undefined{
  for(const child of Children.toArray(node)){
    if(!isValidElement<{children?:ReactNode;onChange?:Change}>(child))continue;
    if(child.type==='select')return child.props.onChange;
    const nested=changeHandler(child.props.children);if(nested)return nested;
  }
}
function buttonHandler(node:ReactNode,label:string):Click|undefined{
  for(const child of Children.toArray(node)){
    if(!isValidElement<{children?:ReactNode;onClick?:Click}>(child))continue;
    if(child.type==='button'&&Children.toArray(child.props.children).join('')===label)return child.props.onClick;
    const nested=buttonHandler(child.props.children,label);if(nested)return nested;
  }
}
async function mountEffects(){for(const effect of f.effects.splice(0))effect();await Promise.resolve();}
const paths=['/mx/editorial/example','/co/editorial/example','/pe/editorial/example','/br/editorial/example','/en/editorial/example'];
beforeEach(()=>{
  vi.clearAllMocks();f.effects.length=0;
  vi.stubGlobal('fetch',f.fetch);
  vi.stubGlobal('window',{location:{pathname:'/en/editorial/example',search:'?edition=pe',hash:'#article',assign:f.assign,reload:f.reload}});
  vi.stubGlobal('sessionStorage',{getItem:vi.fn(()=>null),setItem:vi.fn(),removeItem:vi.fn()});
  f.fetch.mockResolvedValue(new Response(null,{status:200}));
});
afterEach(()=>vi.unstubAllGlobals());

describe('Owner preview is independent of route and language',()=>{
  it.each(CORE_GEOS)('keeps signed %s preview through all language routes without changing its cookie',async previewGeo=>{
    for(const pathname of paths){
      window.location.pathname=pathname;
      const bar=OwnerPreviewBar({preview:true,previewGeo});
      await mountEffects();
      expect(bar.props['data-preview-geo']).toBe(previewGeo);
      expect(bar.props['data-route-mismatch']).toBeUndefined();
    }
    expect(f.fetch).not.toHaveBeenCalled();expect(f.assign).not.toHaveBeenCalled();expect(f.reload).not.toHaveBeenCalled();
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
  });
  it('leaves Real GEO unchanged while navigating every language route',async()=>{
    for(const pathname of paths){
      window.location.pathname=pathname;
      expect(OwnerPreviewBar({preview:false,previewGeo:null}).props['data-preview-geo']).toBe('REAL');
      await mountEffects();
    }
    expect(f.fetch).not.toHaveBeenCalled();expect(f.assign).not.toHaveBeenCalled();expect(f.reload).not.toHaveBeenCalled();
  });
});

describe('explicit Owner preview changes replace private hydration state',()=>{
  it.each(CORE_GEOS.flatMap(geo=>paths.map(path=>[geo,path] as const)))('selecting %s retains %s, its query and hash',async(geo,pathname)=>{
    window.location.pathname=pathname;
    await changeHandler(OwnerPreviewBar({preview:true,previewGeo:'CO'}))!({target:{value:geo}});
    expect(f.fetch).toHaveBeenCalledExactlyOnceWith('/api/owner/preview',expect.objectContaining({method:'POST',cache:'no-store',body:JSON.stringify({action:'preview',geo})}));
    expect(f.reload).toHaveBeenCalledTimes(1);expect(f.assign).not.toHaveBeenCalled();
    expect(window.location).toMatchObject({pathname,search:'?edition=pe',hash:'#article'});
  });
  it('preserves the full-document reset to real GEO on the current page',async()=>{
    await changeHandler(OwnerPreviewBar({preview:true,previewGeo:'CO'}))!({target:{value:''}});
    expect(f.fetch).toHaveBeenCalledWith('/api/owner/preview',expect.objectContaining({body:JSON.stringify({action:'preview',geo:null})}));
    expect(f.reload).toHaveBeenCalledTimes(1);expect(f.assign).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/en/editorial/example');
  });
  it('waits for the signed session change before reloading',async()=>{
    let finish!:(response:Response)=>void;
    f.fetch.mockReturnValue(new Promise<Response>(resolve=>{finish=resolve;}));
    const pending=changeHandler(OwnerPreviewBar({preview:false}))!({target:{value:'CO'}});
    expect(f.assign).not.toHaveBeenCalled();expect(f.reload).not.toHaveBeenCalled();
    finish(new Response(null,{status:200}));await pending;
    expect(f.reload).toHaveBeenCalledTimes(1);expect(f.assign).not.toHaveBeenCalled();
  });
  it.each([401,403,429,503])('retains the page and error state after a denied preview change (%s)',async status=>{
    f.fetch.mockResolvedValue(new Response(null,{status}));
    await changeHandler(OwnerPreviewBar({preview:false}))!({target:{value:'CO'}});
    expect(f.assign).not.toHaveBeenCalled();expect(f.reload).not.toHaveBeenCalled();
    expect(f.setState).toHaveBeenCalledWith('Open owner controls to sign in again.');
    expect(f.setState).toHaveBeenLastCalledWith(false);
  });
  it.each(CORE_GEOS)('the dedicated %s preview button also retains the Owner controls route',async geo=>{
    window.location.pathname='/owner/preview';
    const controls=PreviewControls({authorized:true,configured:true,preview:false,previewGeo:null,country:'GE'});
    const click=buttonHandler(controls,`Preview ${geoProfile(geo).countryName}`);
    expect(click).toBeTypeOf('function');await click!();
    expect(f.fetch).toHaveBeenCalledExactlyOnceWith('/api/owner/preview',expect.objectContaining({body:JSON.stringify({action:'preview',geo})}));
    expect(f.reload).toHaveBeenCalledTimes(1);expect(f.assign).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/owner/preview');
  });
});
