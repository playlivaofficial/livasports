import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {ThemeToggle} from './ThemeToggle';

describe('warm theme presentation',()=>{
  const layouts=['PublicRootLayout','RequestRootLayout'].map(name=>readFileSync(`src/localization/${name}.tsx`,'utf8'));
  const bootstraps=layouts.map(layout=>/__html:'([^']+)'/.exec(layout)![1]);
  const styles=readFileSync('src/localization/site-styles.ts','utf8');
  it.each([null,'light','dark','invalid'] as const)('safely applies saved theme %s before paint',saved=>{
    for(const bootstrap of bootstraps){
      const document={documentElement:{dataset:{theme:'light'}}};
      runInNewContext(bootstrap,{document,localStorage:{getItem:()=>saved}});
      expect(document.documentElement.dataset.theme).toBe(saved==='dark'?'dark':'light');
    }
  });
  it('retains light when browser storage is blocked',()=>{
    for(const bootstrap of bootstraps){
      const document={documentElement:{dataset:{theme:'light'}}};
      expect(()=>runInNewContext(bootstrap,{document,localStorage:{getItem:()=>{throw Error('blocked');}}})).not.toThrow();
      expect(document.documentElement.dataset.theme).toBe('light');
    }
  });
  it.each([['br','Ativar modo escuro'],['en','Switch to dark mode'],['mx','Activar modo oscuro']] as const)('labels the %s theme control', (locale,label)=>{
    const html=renderToStaticMarkup(<ThemeToggle locale={locale}/>);
    expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-hidden="true"');
  });
  it('loads the complete theme layer after the legacy presentation layers',()=>{
    expect(styles.indexOf("'@/app/warm-themes.css'")).toBeGreaterThan(styles.indexOf("'@/app/premium-redesign.css'"));
    const css=readFileSync('src/app/warm-themes.css','utf8');
    expect(css).toContain(":root[data-theme='dark']");
    for(const surface of ['.board-empty','.slip-panel','.sports-table','.match-panel','.profile-panel','.sponsor-mobile_inline'])expect(css).toContain(surface);
    expect(css).toContain('.theme-toggle:focus-visible');
  });
  it('removes public age labels without removing quote expiry checks',()=>{
    const odds=readFileSync('src/components/sports/OddsComparison.tsx','utf8');
    expect(odds).not.toContain('oddsFreshnessCompact');
    expect(odds).not.toContain('listing-odds-fresh');
    expect(odds).toContain('expiresAt');
    const pregame=readFileSync('src/components/match/PregameOdds.tsx','utf8');
    expect(pregame).not.toContain('className="odds-freshness"');
    expect(pregame).toContain('expiresAt');
  });
});
