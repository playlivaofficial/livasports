import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {CommercialActivation,embedSource} from './CommercialActivation';
import {safeOneXBetIframe} from '@/affiliate/embed-policy';

const css=readFileSync('src/app/owner/commercial/commercial.css','utf8');
function luminance(hex:string){
  const rgb=hex.slice(1).match(/../g)!.map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
describe('owner commercial contrast',()=>{
  it('keeps heading, introduction and currency inside the explicit owner dark surface',()=>{
    const html=renderToStaticMarkup(<CommercialActivation operators={[]}/>);
    expect(html).toMatch(/^<main class="commercial-owner"><h1>Commercial Activation/);
    expect(html).toContain('MXN');expect(html).toContain('Each country has independent legal');
    const root=css.match(/\.commercial-owner\{([^}]+)\}/)![1];
    expect(root).toContain('color:#edf4f8');expect(root).toContain('background:#0f1a21');
    expect(root).toContain('color-scheme:dark');expect(root).toContain('box-sizing:border-box');
    expect(root).not.toContain('var(--text-primary');
  });
  it('keeps body text and owner navigation above normal-text AA contrast on that surface',()=>{
    const root=css.match(/\.commercial-owner\{([^}]+)\}/)![1];
    const background=root.match(/background:(#[0-9a-f]{6})/)![1];
    const body=root.match(/(?:^|;)color:(#[0-9a-f]{6})/)![1];
    const link=css.match(/\.commercial-owner>a\{color:(#[0-9a-f]{6})/)![1];
    for(const foreground of [body,link])expect((luminance(foreground)+.05)/(luminance(background)+.05)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('pasting a generated creative',()=>{
  // Synthetic token only; the real channel tag exists solely in server-side campaign configuration.
  const url='https://1xaff.pe/I?tag=SyntheticTag_000001&site=6175483&ad=178222';
  it('accepts a whole iframe snippet and sends only its source URL',()=>{
    const snippet=`<iframe scrolling='no' frameBorder='0' width='100%' height='50' src="${url}"></iframe>`;
    expect(embedSource(snippet)).toBe(url);
    // And the extracted value is what the server contract accepts, unchanged.
    expect(safeOneXBetIframe(embedSource(snippet),'1xbet','pe')).toBe(url);
  });
  it('accepts a bare URL unchanged, and decodes an entity-escaped snippet',()=>{
    expect(embedSource(url)).toBe(url);
    expect(embedSource(`  ${url}  `)).toBe(url);
    expect(embedSource(`<iframe src="${url.replaceAll('&','&amp;')}"></iframe>`)).toBe(url);
  });
  it('extracts nothing from an empty or absent value',()=>{
    for(const value of ['','   ',null,undefined]) expect(embedSource(value)).toBe('');
  });
  it('leaves a snippet with no source for the server to reject',()=>{
    // Normalisation never invents a source; the activation then fails closed server-side.
    expect(safeOneXBetIframe(embedSource('<iframe></iframe>'),'1xbet','pe')).toBeNull();
    expect(safeOneXBetIframe(embedSource('<iframe src="https://evil.invalid/I?tag=x"></iframe>'),'1xbet','pe')).toBeNull();
  });
  it('offers one embed slot per approved role, accepts a snippet in each and forces none of them',()=>{
    // Synthetic operator row only; nothing here is a real campaign, destination or approval.
    const operator={operator:'betsson',brand:'Betsson',geo:'MX' as const,currency:'MXN',status:'CANDIDATE',legalStatus:'VERIFIED',
      legalReference:'synthetic reference',legalVerifiedAt:'2026-10-05',providerMappings:[{provider:'ODDSPAPI',id:'betsson',verified:true}],
      sourceDomains:['www.betsson.com'],destinationDomains:['betsson.mx'],sportsbookEnabled:true,oddsVisible:true,version:0,
      lastValidatedAt:null,quoteCount:0,lastQuoteAt:null,affiliateUrl:null,campaignId:null,subId:null,validUntil:null,offer:{}};
    const html=renderToStaticMarkup(<CommercialActivation operators={[operator]}/>);
    for(const role of ['top','right','mobile']){
      const tag=html.match(new RegExp(`<input[^>]*name="embed_${role}"[^>]*/>`))?.[0];
      expect(tag,`embed_${role} input`).toBeDefined();
      // type="url" would reject a pasted iframe snippet in the browser before it ever reached us.
      expect(tag).toContain('type="text"');
      expect(tag).not.toContain('type="url"');
      // Every slot stays optional: an operator holds only the placements its jurisdiction grants it.
      expect(tag).not.toContain('required');
    }
    expect(html).toContain('either the image-mode URL or the whole iframe snippet');
  });
});
