import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const css=readFileSync(new URL('./v2.css',import.meta.url),'utf8');
function luminance(hex:string){
  const channels=hex.replace('#','').match(/.{2}/g)!.map(value=>parseInt(value,16)/255)
    .map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
  return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
function token(rule:string,name:string){let value=new RegExp(`--v2-${name}:([^;}]+)`).exec(rule)![1];if(value.length===4)value='#'+[...value.slice(1)].map(char=>char+char).join('');return value;}
describe('expanded V2 language menu theme parity',()=>{
  it('overrides legacy pale text and selected backgrounds with V2 theme tokens',()=>{
    expect(css).toContain('.v2-menu-panel .language-picker button{color:var(--v2-text);background:transparent;min-height:44px}');
    expect(css).toContain('.v2-menu-panel .language-picker button:hover,.v2-menu-panel .language-picker button[aria-current=true]{color:var(--v2-green);background:var(--v2-soft)}');
  });
  it.each([':root','html[data-theme=dark]'])('%s language choices meet normal-text contrast in both states',selector=>{
    const rule=css.slice(css.indexOf(selector+'{')).split('}')[0];
    expect(contrast(token(rule,'text'),token(rule,'surface'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(rule,'green'),token(rule,'soft'))).toBeGreaterThanOrEqual(4.5);
  });
  it.each([':root','html[data-theme=dark]'])('%s Owner preview buttons remain readable',selector=>{
    const rule=css.slice(css.indexOf(selector+'{')).split('}')[0];
    expect(css).toContain('.owner-preview-page button{background:var(--v2-green);color:var(--v2-surface);');
    expect(contrast(token(rule,'surface'),token(rule,'green'))).toBeGreaterThanOrEqual(4.5);
  });
});
