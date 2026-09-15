import {describe,expect,it} from 'vitest';
import {NextRequest} from 'next/server';
import {POST} from '@/app/time-zone/route';
import {resolveTimeZone,safeTimeZoneReturn,validTimeZone} from './time-zone';
const origin='https://livasports.com';
function request(timeZone:string,mode='manual',returnTo='/en/football?competition=liga-mx&season=old#squad',source=origin){
  const data=new FormData();data.set('timeZone',timeZone);data.set('mode',mode);data.set('returnTo',returnTo);
  return new NextRequest(origin+'/time-zone',{method:'POST',headers:{origin:source},body:data});
}
describe('sports time preferences',()=>{
  it('uses the detected device zone in every interface language without changing commercial eligibility',()=>{
    expect(resolveTimeZone('br',null,'Asia/Tokyo')).toBe('Asia/Tokyo');
    expect(resolveTimeZone('mx',null,'Europe/London')).toBe('Europe/London');
    expect(resolveTimeZone('en',null,'America/Sao_Paulo')).toBe('America/Sao_Paulo');
    expect(resolveTimeZone('en',null,'bad')).toBe('UTC');
    expect(resolveTimeZone('br',null,'bad')).toBe('America/Sao_Paulo');
    expect(resolveTimeZone('mx',null,'bad')).toBe('America/Mexico_City');
    for(const locale of ['br','mx','en'] as const)expect(resolveTimeZone(locale,'Pacific/Kiritimati','Asia/Tokyo')).toBe('Pacific/Kiritimati');
  });
  it.each(['','America/Unknown','//evil.test','../UTC','UTC\r\nSet-Cookie:x','+01:00','x'.repeat(81)])('rejects invalid zone %s',v=>expect(validTimeZone(v)).toBeNull());
  it('persists one secure first-party preference and retains path, filters and fragment',async()=>{
    const response=await POST(request('Asia/Tokyo'));
    expect(response.status).toBe(303);expect(response.headers.get('location')).toBe(origin+'/en/football?competition=liga-mx&season=old#squad');
    const cookie=response.headers.get('set-cookie')!;
    expect(cookie).toContain('livasports_time_zone=Asia%2FTokyo');expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Secure');expect(cookie).toContain('SameSite=lax');
    expect(cookie).not.toMatch(/language|affiliate|country|geo/i);
  });
  it('stores device detection separately and allows clearing the manual override',async()=>{
    const auto=await POST(request('Europe/Madrid','device'));expect(auto.status).toBe(204);expect(auto.headers.get('set-cookie')).toContain('livasports_device_time_zone');
    const clear=await POST(request('auto'));expect(clear.status).toBe(303);expect(clear.headers.get('set-cookie')).toContain('Max-Age=0');
  });
  it('rejects foreign origins, unknown modes and invalid zones',async()=>{
    expect((await POST(request('UTC','manual','/en','https://evil.test'))).status).toBe(403);
    expect((await POST(request('UTC','wrong'))).status).toBe(400);
    expect((await POST(request('Unknown'))).status).toBe(400);
  });
  it.each(['//evil.test','https://evil.test','/en\\evil','/api/events','/en\r\nLocation:evil'])('never redirects outside a language route: %s',path=>expect(safeTimeZoneReturn(path)).toBe('/en'));
});
