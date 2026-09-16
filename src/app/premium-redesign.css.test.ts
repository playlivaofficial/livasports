import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('premium light-first visual system',()=>{
  const css=readFileSync('src/app/premium-redesign.css','utf8');

  it('keeps the light-first palette and dark sports header explicit',()=>{
    expect(css).toContain('color-scheme: light');
    expect(css).toContain('--color-bg: #f3f6f5');
    expect(css).toContain('.app-header');
    expect(css).toContain('background: rgba(6, 27, 27, .97)');
  });

  it('protects the intentional mobile layout and full-width sponsor',()=>{
    expect(css).toContain('@media (max-width: 767px)');
    expect(css).toContain('width: calc(100% + 1.2rem)');
    expect(css).toContain('.sponsor-mobile_inline');
    expect(css).toContain('margin: .7rem -.6rem 1rem');
    expect(css).toContain('.slip-panel');
  });

  it('preserves keyboard and reduced-motion accessibility',()=>{
    expect(css).toContain(':focus-visible');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain(':focus-visible { outline-color: #0a8060; }');
  });
});
