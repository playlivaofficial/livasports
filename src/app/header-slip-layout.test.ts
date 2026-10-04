import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('desktop header with the reserved slip rail',()=>{
  const css=readFileSync('src/app/sports-product.css','utf8');
  const rules=css.slice(css.indexOf('/* A reserved 400px slip rail'));
  it('gives primary navigation and action controls separate rows only while the desktop slip is open',()=>{
    expect(rules).toContain('@media(min-width:1100px)');
    expect(rules).toContain('body[data-slip-open=true] .header-inner { display:grid; grid-template-columns:auto minmax(0,1fr);');
    expect(rules).toContain('body[data-slip-open=true] .header-inner>.brand { grid-column:1; grid-row:1; }');
    expect(rules).toContain('body[data-slip-open=true] .main-nav { grid-column:2; grid-row:1;');
    expect(rules).toContain('body[data-slip-open=true] .sports-header-actions { grid-column:1 / -1; grid-row:2; width:100%; flex-wrap:wrap;');
    expect(rules).toContain('body[data-slip-open=true] { --header-height:105px; }');
  });
  it('keeps search, My Matches and all primary links visible without word-by-word compression',()=>{
    expect(rules).toContain('body[data-slip-open=true] .sports-header-actions>* { flex-shrink:0; }');
    expect(rules).toContain('.sports-search-link { display:inline-flex; min-height:44px; align-items:center; white-space:nowrap; }');
    expect(rules).toContain('.my-matches-header-link { white-space:nowrap; }');
    expect(rules).not.toMatch(/display:\s*none|visibility:\s*hidden|overflow:\s*hidden/);
    const header=readFileSync('src/components/sports/SiteHeader.tsx','utf8');
    for(const route of ['routes.home','routes.football','routes.live','routes.today'])expect(header).toContain(route);
    for(const feature of ['favoritesPath(locale)','sports-search-link','TimeZoneSelector','ThemeToggle','LanguageSelector','AuthHeaderLink'])expect(header).toContain(feature);
  });
});
