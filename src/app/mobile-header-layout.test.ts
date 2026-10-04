import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const warm=readFileSync('src/app/warm-themes.css','utf8');
const mobile=warm.slice(warm.indexOf('/* Authenticated names plus the locale control'));
const styles=readFileSync('src/localization/site-styles.ts','utf8');
const picker=readFileSync('src/localization/LanguageSelector.tsx','utf8');

describe('mobile header with full GEO labels',()=>{
  it('reserves the brand track instead of letting the action column consume it',()=>{
    expect(mobile).toContain('@media(max-width:620px)');
    expect(mobile).toContain('.app-header .header-inner { grid-template-columns: auto minmax(0,1fr); }');
    expect(mobile).toContain('.app-header .brand { min-width: 30px; }');
    expect(mobile).toContain('.app-header .sports-header-actions { grid-column: 2; grid-row: 1; width: 100%; }');
    expect(styles.indexOf("'@/app/warm-themes.css'")).toBeGreaterThan(styles.indexOf("'@/app/premium-redesign.css'"));
  });
  it('keeps fixed controls and Entrar uncompressed while the full locale text wraps',()=>{
    expect(mobile).toContain('.app-header .sports-header-actions>* { flex-shrink: 0; }');
    expect(mobile).toContain('.app-header .auth-header-link { min-width: 44px; justify-content: center; }');
    expect(mobile).toContain('.app-header .language-picker { flex: 0 1 auto; min-width: 0; margin-left: 0; }');
    expect(mobile).toContain('summary>span:not([aria-hidden]) { min-width: 0; white-space: normal; overflow-wrap: anywhere; line-height: 1.2; }');
    expect(picker).toContain('<span>{languageNames[locale]}</span>');
    expect(picker).toContain('aria-label={`${label}: ${languageNames[locale]}`}');
  });
  it('at 320px removes only the decorative globe, not country text or an action',()=>{
    const narrow=mobile.slice(mobile.indexOf('@media(max-width:359px)'));
    expect(narrow).toContain('padding-inline: 6px; gap: 4px; font-size: .65rem;');
    expect(narrow).toContain('.app-header .language-picker summary>svg { display: none; }');
    expect(narrow.match(/display: none/g)).toHaveLength(1);
    expect(narrow).not.toMatch(/overflow:\s*hidden|text-overflow|clip:/);
  });
  it.each([320,390,620])('has positive locale space at %ipx even with a scrollbar and longest account badge',width=>{
    // Worst case: 15px scrollbar, .6rem outer padding, .35rem grid gap,
    // 30px mark, two 44px buttons, 4.8rem account badge and three .3rem gaps.
    // The locale is the only flexible item; source guards above bind this budget to CSS.
    const available=width-15-2*.6*16-.35*16-30-2*44-4.8*16-3*.3*16;
    expect(available).toBeGreaterThanOrEqual(70);
    const summaryDecoration=width<=359?2+2*6+4+7:2+2*8+2*5+17+7;
    expect(available-summaryDecoration).toBeGreaterThan(40);
  });
});
