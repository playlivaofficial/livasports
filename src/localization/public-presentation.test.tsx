import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextRequest} from 'next/server';
import {readFileSync} from 'node:fs';
import {GET} from '@/app/api/presentation/route';
import {ownerCookie,newOwnerSession,signOwnerSession,accessKeyHash} from '@/owner/session';
import {PublicRootLayout} from './PublicRootLayout';
import {PublicPresentation} from './PublicPresentation';
import {LocalizedTimeText} from './LocalizedTime';
import {TimePreferenceProvider,useTimePreference} from './TimeZoneSelector';
import {shouldDetectDeviceTimeZone} from './time-zone';
import {languageTags,type InterfaceLocale} from './interface';

vi.mock('@/localization/site-styles',()=>({}));
vi.mock('@/analytics/AnalyticsBoot',()=>({AnalyticsBoot:()=>null}));
vi.mock('@/localization/LegacyPageShell',()=>({LegacyPageShell:()=>null}));

const request=(cookie='',extra:Record<string,string>={})=>new NextRequest('https://livasports.com/api/presentation',{headers:{cookie,...extra}});
beforeEach(()=>{
  vi.stubEnv('OWNER_QA_SESSION_SECRET','test-only-session-material-'.repeat(3));
  vi.stubEnv('OWNER_QA_ACCESS_HASH',accessKeyHash('test-only-access-key-material-'.repeat(3)));
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});

describe('private presentation endpoint',()=>{
  it('never puts account state in a public cache or sets a cookie',async()=>{
    const response=GET(request());
    expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie');expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.has('set-cookie')).toBe(false);expect(response.headers.has('access-control-allow-origin')).toBe(false);
    expect(await response.json()).toEqual({manual:null,device:null,owner:{authorized:false,preview:false}});
  });
  it('returns only validated time zones and two owner flags, never session IDs or secrets',async()=>{
    const session={...newOwnerSession(),preview:true};const token=signOwnerSession(session);
    const response=GET(request(`${ownerCookie}=${token}; livasports_time_zone=Asia%2FTokyo; livasports_device_time_zone=America%2FMexico_City`));
    const body=await response.text();
    expect(JSON.parse(body)).toEqual({manual:'Asia/Tokyo',device:'America/Mexico_City',owner:{authorized:true,preview:true}});
    expect(body).not.toContain(session.id);expect(body).not.toContain(token);expect(body).not.toContain('expiresAt');expect(body).not.toContain(process.env.OWNER_QA_SESSION_SECRET!);
  });
  it('fails closed for forged headers, signatures, expired sessions, and duplicated owner cookies',async()=>{
    const valid=signOwnerSession({...newOwnerSession(),preview:true});
    const expired=signOwnerSession({...newOwnerSession(),expiresAt:Date.now()-1000,preview:true});
    for(const cookie of [`${ownerCookie}=forged`,`${ownerCookie}=${valid.slice(0,-1)}!`,`${ownerCookie}=${expired}`,`${ownerCookie}=${valid}; ${ownerCookie}=${valid}`]){
      const body=await GET(request(cookie,{'x-owner-authorized':'true','x-livasports-owner-preview':'BR'})).json();
      expect(body.owner).toEqual({authorized:false,preview:false});
    }
  });
  it('does not trust invalid timezone cookies or silently turn a device preference into GEO authority',async()=>{
    const response=GET(request('livasports_time_zone=not-a-zone; livasports_device_time_zone=%2F%2Fevil.test',{'x-vercel-ip-country':'PE'}));
    const body=await response.json();expect(body.manual).toBeNull();expect(body.device).toBeNull();expect(Object.keys(body).sort()).toEqual(['device','manual','owner']);
  });
  it('denies previously signed sessions after owner access is unconfigured',async()=>{
    const token=signOwnerSession({...newOwnerSession(),preview:true});vi.stubEnv('OWNER_QA_SESSION_SECRET','');
    expect((await GET(request(`${ownerCookie}=${token}`)).json()).owner).toEqual({authorized:false,preview:false});
  });
});

describe('public root shell privacy and deterministic hydration',()=>{
  it.each(['br','mx','en'] as const)('renders the explicit %s locale and footer with no owner state in shared HTML',locale=>{
    const fetch=vi.spyOn(globalThis,'fetch');
    const html=renderToStaticMarkup(<PublicRootLayout locale={locale}><main>Public fixture facts</main></PublicRootLayout>);
    expect(html).toContain(`<html lang="${languageTags[locale]}"`);expect(html).toContain(`<footer class="sports-site-footer" lang="${languageTags[locale]}"`);
    expect(html).toContain('Public fixture facts');expect(html).not.toContain('Owner controls');expect(html).not.toContain('QA_TEST');expect(html).not.toContain('owner-preview-bar');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('public presentation starts identically for every viewer and cannot leak an owner bar before its private read',()=>{
    const html=renderToStaticMarkup(<PublicPresentation><p>Safe shell</p></PublicPresentation>);
    expect(html).toBe('<p>Safe shell</p>');
    const source=readFileSync('src/localization/PublicRootLayout.tsx','utf8');
    expect(source).not.toMatch(/next\/headers|requestOwnerSession|requestTimePreference/);
  });
  it('defers device detection until private preferences arrive; private server layouts remain ready by default',()=>{
    function Ready(){return <span>{String(useTimePreference().ready)}</span>;}
    expect(renderToStaticMarkup(<PublicPresentation><Ready/></PublicPresentation>)).toBe('<span>false</span>');
    expect(renderToStaticMarkup(<TimePreferenceProvider manual={null} device={null}><Ready/></TimePreferenceProvider>)).toBe('<span>true</span>');
    expect(shouldDetectDeviceTimeZone(false,null,null,'Asia/Tokyo')).toBe(false);
    expect(shouldDetectDeviceTimeZone(true,'America/Mexico_City',null,'Asia/Tokyo')).toBe(false);
    expect(shouldDetectDeviceTimeZone(true,null,'Asia/Tokyo','Asia/Tokyo')).toBe(false);
    expect(shouldDetectDeviceTimeZone(true,null,null,'')).toBe(false);
    expect(shouldDetectDeviceTimeZone(true,null,null,'Asia/Tokyo')).toBe(true);
  });
  it.each([['br','09:00'],['mx','06:00'],['en','12:00']] as const)('uses route-default time for %s server output', (locale,expected)=>{
    const html=renderToStaticMarkup(<LocalizedTimeText value="2026-10-04T12:00:00Z" locale={locale} options={{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}}/>);
    expect(html).toBe(expected);
  });
  it('hydrates the manual preference without changing interface locale or persisting it into the shared shell',()=>{
    const time=(locale:InterfaceLocale)=><LocalizedTimeText value="2026-10-04T12:00:00Z" locale={locale} options={{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}}/>;
    expect(renderToStaticMarkup(<TimePreferenceProvider manual="Asia/Tokyo" device="UTC">{time('mx')}</TimePreferenceProvider>)).toBe('21:00');
    expect(renderToStaticMarkup(time('mx'))).toBe('06:00');
    expect(renderToStaticMarkup(<TimePreferenceProvider manual={null} device="Europe/London">{time('mx')}</TimePreferenceProvider>)).toBe('13:00');
  });
  it('never emits an invalid date string',()=>{
    expect(renderToStaticMarkup(<LocalizedTimeText value="bad timestamp" locale="en" options={{dateStyle:'short'}}/>)).toBe('—');
  });
});
