import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {StickySponsor} from './StickySponsor';
import {creativeFit} from './SponsoredCreative';

describe('one persistent mobile sponsor, unchanged commercial authorization',()=>{
 it('renders one creative, not a second fixed-position advertisement',()=>{
  const html=renderToStaticMarkup(<StickySponsor><aside data-campaign="existing-approved">Creative</aside></StickySponsor>);
  expect(html.match(/<aside/g)).toHaveLength(1);expect(html).toContain('data-sticky-sponsor="true"');
 });
 it('only observes geometry; scroll never requests offers or emits impressions',()=>{
  const code=readFileSync('src/components/commercial/StickySponsor.tsx','utf8');
  expect(code).toContain('ResizeObserver');expect(code).toContain('.owner-preview-bar');expect(code).toContain('.app-header');
  expect(code).not.toMatch(/requestOffer|emitProductEvent|fetch\(|scrollIntoView|addEventListener\(['"]scroll/);
  const css=readFileSync('src/app/four-source-odds.css','utf8');
  expect(css).toContain('top:var(--commercial-nav-height,var(--header-height))');
  expect(css).toContain('scroll-padding-top:calc(');
 });
 it.each([304,320,366,406])('uses available phone width %s without changing the approved aspect ratio',width=>{
  const fit=creativeFit(width,320,1.35);
  expect(fit.offset).toBe(0);expect(320*fit.scale).toBeCloseTo(width);expect((320*fit.scale)/(100*fit.scale)).toBeCloseTo(3.2);
 });
 it('retains native-size desktop and caps mobile enlargement',()=>{
  expect(creativeFit(970,320)).toEqual({scale:1,offset:325});
  expect(creativeFit(768,320,1.35).scale).toBe(1.35);
 });
 it('keeps desktop as well as mobile header controls below the owner bar',()=>{
  const css=readFileSync('src/app/four-source-odds.css','utf8');
  expect(css.replace(/\r\n/g,'\n')).toContain('.app-header { top:var(--commercial-owner-height,0px); }\n@media(max-width:767px)');
 });
});
