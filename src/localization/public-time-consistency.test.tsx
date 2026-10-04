import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {type ComponentProps,type ReactElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextRequest} from 'next/server';
import {PublicPresentation} from './PublicPresentation';
import {TimePreferenceProvider} from './TimeZoneSelector';
import {LocalizedTimeText} from './LocalizedTime';
import {deviceTimeZoneCookie,resolveTimeZone,shouldDetectDeviceTimeZone} from './time-zone';
import {languageTags,type InterfaceLocale} from './interface';
import {POST} from '@/app/time-zone/route';
import {GET} from '@/app/api/presentation/route';

// Exercise the private-read effect without a browser/DOM dependency. Rendering
// time consumers below still uses real React context and date formatting.
const hooks=vi.hoisted(()=>({state:[] as unknown[],cursor:0,effects:[] as (()=>void|(()=>void))[]}));
vi.mock('react',async importOriginal=>({
  ...await importOriginal<typeof import('react')>(),
  useState:(initial:unknown)=>{
    const index=hooks.cursor++;
    if(!(index in hooks.state))hooks.state[index]=initial;
    return [hooks.state[index],(value:unknown)=>{hooks.state[index]=value;}];
  },
  useEffect:(effect:()=>void|(()=>void))=>{hooks.effects.push(effect);},
}));

type Preference=ComponentProps<typeof TimePreferenceProvider>;
function presentation(){
  hooks.cursor=0;
  return (PublicPresentation({children:null}).props.children as ReactElement<Preference>).props;
}
async function privateRead(body:unknown){
  hooks.state=[];hooks.effects=[];
  const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>body});vi.stubGlobal('fetch',fetch);
  expect(presentation()).toMatchObject({manual:null,device:null,ready:false});
  hooks.effects.shift()!();
  await vi.waitFor(()=>expect(presentation().ready).toBe(true));
  expect(fetch).toHaveBeenCalledWith('/api/presentation',expect.objectContaining({cache:'no-store',credentials:'same-origin'}));
  return presentation();
}
const kickoff='2026-10-11T15:30:00Z',options={hour:'2-digit',minute:'2-digit',hourCycle:'h23'} as const;
function expectBoardAndGrowthAgree(locale:InterfaceLocale,preference:Preference,expected:string){
  const board=new Intl.DateTimeFormat(languageTags[locale],{...options,timeZone:resolveTimeZone(locale,preference.manual,preference.device)}).format(new Date(kickoff));
  const growth=renderToStaticMarkup(<TimePreferenceProvider {...preference}><LocalizedTimeText locale={locale} value={kickoff} options={options}/></TimePreferenceProvider>);
  expect(board).toBe(expected);expect(growth).toBe(board);
}
beforeEach(()=>{
  hooks.state=[];hooks.effects=[];hooks.cursor=0;
  vi.stubEnv('TZ','Asia/Tbilisi');
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Asia/Tbilisi');
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('public Growth and request-rendered board timezone consistency',()=>{
  it('does not masquerade an unsaved browser zone as a persisted device preference',async()=>{
    const preference=await privateRead({manual:null,device:null});
    expect(preference).toMatchObject({manual:null,device:null,ready:true});
    expectBoardAndGrowthAgree('co',preference,'10:30');
    expect(shouldDetectDeviceTimeZone(preference.ready!,preference.manual,preference.device,'Asia/Tbilisi')).toBe(true);
  });
  it('uses the same saved device zone after the existing private cookie/reload flow',async()=>{
    const form=new FormData();form.set('mode','device');form.set('timeZone','Asia/Tbilisi');
    const saved=await POST(new NextRequest('https://livasports.com/time-zone',{method:'POST',headers:{origin:'https://livasports.com'},body:form}));
    expect(saved.status).toBe(204);expect(saved.headers.get('cache-control')).toBe('private, no-store');
    const cookie=saved.headers.get('set-cookie')!.split(';',1)[0];
    expect(cookie).toContain(`${deviceTimeZoneCookie}=`);
    const response=GET(new NextRequest('https://livasports.com/api/presentation',{headers:{cookie}}));
    const preference=await privateRead(await response.json());
    expect(preference.device).toBe('Asia/Tbilisi');
    for(const locale of ['mx','co','pe'] as const)expectBoardAndGrowthAgree(locale,preference,'19:30');
    expect(shouldDetectDeviceTimeZone(preference.ready!,preference.manual,preference.device,'Asia/Tbilisi')).toBe(false);
  });
  it('preserves explicit manual priority and never overrides it with browser detection',async()=>{
    const preference=await privateRead({manual:'America/Lima',device:'Asia/Tbilisi'});
    for(const locale of ['mx','co','pe'] as const)expectBoardAndGrowthAgree(locale,preference,'10:30');
    expect(shouldDetectDeviceTimeZone(preference.ready!,preference.manual,preference.device,'Asia/Tbilisi')).toBe(false);
  });
  it('leaves invalid stored zones unset so safe device persistence can run',async()=>{
    const preference=await privateRead({manual:'not-a-zone',device:'not-a-zone'});
    expect(preference).toMatchObject({manual:null,device:null});
    expect(shouldDetectDeviceTimeZone(true,preference.manual,preference.device,'Asia/Tbilisi')).toBe(true);
  });
});
