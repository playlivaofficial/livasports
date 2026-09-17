import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {creativeFit} from '@/components/commercial/SponsoredCreative';

/** Hotfix guards: header My Matches contrast, mobile fixture favorite placement, creative sizing. */
const product=readFileSync('src/app/sports-product.css','utf8');
const warm=readFileSync('src/app/warm-themes.css','utf8');
const premium=readFileSync('src/app/premium-redesign.css','utf8');
const board=readFileSync('src/components/sports/SportsBoardPage.tsx','utf8');
/** Every @media block matching the query, so later same-query blocks in a file are covered too. */
const blocks=(css:string,query:string)=>{const out:string[]=[];let from=0;while(true){const start=css.indexOf(query,from);if(start<0)return out;let depth=0,end=css.length;for(let i=css.indexOf('{',start);i<css.length;i++){if(css[i]==='{')depth++;else if(css[i]==='}'&&--depth===0){end=i+1;break;}}out.push(css.slice(start,end));from=end;}};
const block=(css:string,query:string,needle='')=>blocks(css,query).find(b=>b.includes(needle))??'';

describe('A — header My Matches star stays light on the dark header in both themes',()=>{
  it('uses a header-scoped light foreground and no dark light-theme override',()=>{
    expect(product).toContain('.app-header { --header-fg:#f2faf6; --header-fg-muted:#d5ece6; }');
    expect(product).toContain('.my-matches-header-link>span[aria-hidden] { color:var(--header-fg,#f2faf6)');
    expect(product).not.toMatch(/html\[data-theme=light\] \.my-matches-header-link \{[^}]*color:#17323a/);
    expect(product).not.toMatch(/\.my-matches-header-link[^{]*\{[^}]*color:#1[0-9a-f]{5}/);
    // hover/focus/active/visited never fall back to the page text colour
    expect(product).toMatch(/\.my-matches-header-link:hover,\.my-matches-header-link:focus-visible,\.my-matches-header-link:active,\.my-matches-header-link:visited \{ color:var\(--header-fg/);
    for(const css of [warm,premium])expect(css).not.toMatch(/\.my-matches-header-link[^{]*\{[^}]*color:/);
  });
});

describe('B — mobile fixture favorite has its own grid cell beside the match information',()=>{
  const mobile=block(product,'@media(max-width:767px)','.favorite-toggle-row');
  it('switches the star from absolute positioning to a trailing grid column at ≤767px',()=>{
    expect(mobile).toContain('.sports-board .fixture-row,.sports-board .fixture-row.has-no-odds { grid-template-columns:minmax(0,1fr) 44px; grid-template-rows:auto auto;');
    expect(mobile).toContain('.sports-board .favorite-toggle-row { position:static; transform:none; grid-column:2; grid-row:1; justify-self:end; align-self:center; }');
    expect(mobile).toContain('.sports-board .fixture-row .odds-slot { grid-column:1 / -1; grid-row:2; }');
    expect(mobile).not.toContain('position:absolute');
    // the desktop rule that positions the star in the left gutter is untouched
    expect(product).toContain('.sports-board .favorite-toggle-row { position:absolute; left:0; top:50%; transform:translateY(-50%); }');
    expect(product).toContain('.sports-board .fixture-row { position:relative; padding-left:42px; }');
    // later layers never re-position the row star on mobile
    for(const css of [warm,premium])for(const b of blocks(css,'@media(max-width:767px)'))expect(b).not.toContain('.favorite-toggle-row');
  });
  it('keeps the fixture favorite outside the match link (no nested interactive elements) and separate from the competition favorite',()=>{
    const link=board.slice(board.indexOf('<Link className="fixture-main-link"'),board.indexOf('</Link>',board.indexOf('<Link className="fixture-main-link"')));
    expect(link).not.toContain('FavoriteButton');
    expect(board).toContain('<FavoriteButton locale={locale} kind="fixture" id={f.publicId} className="favorite-toggle-row"/>');
    expect(board).toContain('<FavoriteButton locale={locale} kind="competition" id={section.slug} className="favorite-toggle-compact"/>');
    // odds buttons stop propagation so a price tap never toggles a favorite or navigates
    const odds=readFileSync('src/components/sports/OddsComparison.tsx','utf8');
    expect(odds).toContain('event.preventDefault(); event.stopPropagation();');
  });
});

describe('C — sponsor creatives keep their approved pixel size on mobile',()=>{
  it('never enlarges a fixed-size creative and centres it in the full-width slot',()=>{
    expect(creativeFit(390,320)).toEqual({scale:1,offset:35});
    expect(creativeFit(430,320)).toEqual({scale:1,offset:55});
    expect(creativeFit(304,320)).toEqual({scale:0.95,offset:0});
    expect(creativeFit(1200,970)).toEqual({scale:1,offset:115});
    expect(creativeFit(320,320).scale).toBe(1);
  });
  it('mobile inline slot CSS no longer forces the embed box or image to 100% width',()=>{
    for(const css of [warm,premium]){
      expect(css).not.toMatch(/\.sponsor-embed-box[^{]*\{[^}]*width: 100% !important/);
      expect(css).not.toMatch(/img\) \{ width: 100% !important/);
    }
    expect(warm).toContain(':is(.sponsor-mobile_inline,.sponsor-profile_mobile_inline) { display: grid; justify-items: center; }');
    expect(premium).toContain('.sponsor-mobile_inline a { width: 100%; }');
    // the full-bleed slot itself is preserved
    expect(warm).toContain('.sports-board .sponsor-mobile_inline { width: calc(100% + 1.2rem);');
  });
  it('the embed iframe is rendered with translate + scale only (no image-rendering hacks)',()=>{
    const source=readFileSync('src/components/commercial/SponsoredCreative.tsx','utf8');
    expect(source).toContain('transform:`translateX(${fit.offset}px) scale(${fit.scale})`');
    expect(source).not.toMatch(/image-rendering|filter:/);
    expect(renderToStaticMarkup(createElement('div',null,'guard'))).toContain('guard');
  });
});
