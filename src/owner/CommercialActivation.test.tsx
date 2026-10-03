import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {CommercialActivation} from './CommercialActivation';

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
