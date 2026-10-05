import {describe,it,expect} from 'vitest';
import {embedDimensions,embedTrackingHost,safeBetssonEmbed} from './embed-policy';
import {safeAffiliateDestination} from '@/odds/affiliate';

const source=(redirect:string,campaign='7')=>'https://c.bannerflow.net/a/'+'a'.repeat(24)+'?'+new URLSearchParams(
  {display:'image',did:'b'.repeat(24),deeplink:'on',adgroupid:'c'.repeat(24),redirecturl:redirect,media:'123456',campaign});

describe('MX/CO/PE publisher embed policy',()=>{
  it('maps a tracking host only for the three approved operator/GEO pairs',()=>{
    expect(embedTrackingHost('betsson','mx')).toBe('record.betsson.mx');
    expect(embedTrackingHost('betsson','co')).toBe('record.betsson.co');
    expect(embedTrackingHost('inkabet','pe')).toBe('record.inkabet.pe');
    expect(embedTrackingHost('betsson','br')).toBe('record.betsson.bet.br');
  });
  it('leaves bwin Colombia odds-only, with no embed path at all',()=>{
    // No Entain affiliate access exists, so bwin must never resolve a tracking host or an embed.
    expect(embedTrackingHost('bwin','co')).toBeNull();
    expect(safeBetssonEmbed(source('https://record.betsson.co/x/7'),'7','bwin','co')).toBeNull();
  });
  it('accepts each approved operator against its own tracking host',()=>{
    for(const [operator,locale,host] of [['betsson','mx','record.betsson.mx'],['betsson','co','record.betsson.co'],['inkabet','pe','record.inkabet.pe']] as const){
      const s=source(`https://${host}/synthetic-test-only/7`);
      expect(safeBetssonEmbed(s,'7',operator,locale)).toBe(s);
    }
  });
  it('refuses a tracking host belonging to another jurisdiction',()=>{
    expect(safeBetssonEmbed(source('https://record.betsson.co/x/7'),'7','betsson','mx')).toBeNull();
    expect(safeBetssonEmbed(source('https://record.betsson.mx/x/7'),'7','betsson','co')).toBeNull();
    expect(safeBetssonEmbed(source('https://record.betsson.mx/x/7'),'7','inkabet','pe')).toBeNull();
  });
  it('still refuses a non-Bannerflow source and an unlisted operator',()=>{
    expect(safeBetssonEmbed('https://evil.invalid/a/'+'a'.repeat(24),'7','betsson','mx')).toBeNull();
    expect(safeBetssonEmbed(source('https://record.betsson.mx/x/7'),'7','codere','mx')).toBeNull();
  });
  it('keeps Brazil behaviour unchanged',()=>{
    const s=source('https://record.betsson.bet.br/synthetic-test-only/7');
    expect(safeBetssonEmbed(s,'7')).toBe(s);
    expect(safeBetssonEmbed(s,'7','betsson','br')).toBe(s);
  });
  it('allows the collected creative sizes and nothing else',()=>{
    expect(embedDimensions('home_top_banner',970,90)).toBe(true);
    expect(embedDimensions('home_top_banner',728,90)).toBe(true);
    expect(embedDimensions('match_right_rail',300,250)).toBe(true);
    expect(embedDimensions('match_right_rail',300,600)).toBe(true);
    expect(embedDimensions('mobile_inline',320,50)).toBe(true);
    expect(embedDimensions('mobile_inline',320,100)).toBe(true);
    for(const [p,w,h] of [['home_top_banner',300,250],['match_right_rail',728,90],['mobile_inline',970,90],['home_top_banner',728,100]] as const)
      expect(embedDimensions(p,w,h)).toBe(false);
  });
  it('allowlists each tracking host for its own GEO only',()=>{
    expect(safeAffiliateDestination('betsson','mx','https://record.betsson.mx/x')).toBe('https://record.betsson.mx/x');
    expect(safeAffiliateDestination('betsson','co','https://record.betsson.co/x')).toBe('https://record.betsson.co/x');
    expect(safeAffiliateDestination('inkabet','pe','https://record.inkabet.pe/x')).toBe('https://record.inkabet.pe/x');
    expect(safeAffiliateDestination('betsson','mx','https://record.betsson.co/x')).toBeNull();
    expect(safeAffiliateDestination('inkabet','pe','https://record.betsson.mx/x')).toBeNull();
    // bwin keeps its operator domains and gains no tracking host.
    expect(safeAffiliateDestination('bwin','co','https://record.betsson.co/x')).toBeNull();
    expect(safeAffiliateDestination('bwin','co','https://sports.bwin.co/x')).toBe('https://sports.bwin.co/x');
  });
});
