import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('mobile competition drawer CSS',()=>{
  const css=readFileSync('src/app/sports-board.css','utf8');
  it('hides the panel unless the toggle is checked and does not let board-competitions > div unhide it',()=>{
    expect(css).toContain('.competition-nav-panel { display:none;');
    expect(css).toContain('.competition-nav-toggle:checked ~ .competition-nav-panel { display:block; }');
    expect(css).toContain('.competition-nav-panel>div { display:block; }');
    expect(css).not.toMatch(/\.board-competitions\s*>\s*div\s*,/);
    expect(css).toContain('.competition-nav-toggle:focus-visible + .competition-nav-control');
  });
});
