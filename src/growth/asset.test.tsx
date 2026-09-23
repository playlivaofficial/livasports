import {describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ImageResponse} from 'next/og';
import {createSocialAssetElement,socialAssetSize} from './asset';
import {generateContentPack,fixtureSnapshot} from './content';
import {rankedFixture} from './fixtures.test-support';
import type {GrowthContentItem} from './types';

function item(imageUrl:string|null=null):GrowthContentItem{const row=rankedFixture({home:{slug:'long',name:'Associação Desportiva Ferroviária do Vale',publicId:'a'.repeat(16),imageUrl},
  away:{slug:'palmeiras',name:'Palmeiras',publicId:'b'.repeat(16),imageUrl}});return {
  id:'11111111-1111-4111-8111-111111111111',fixtureId:row.signals.fixtureId,revision:1,sourceHash:'a'.repeat(64),trigger:'OWNER',priorityScore:row.priority.total,
  scoreBreakdown:row.priority.lines,reasons:row.priority.reasons,canonicalUrl:row.destinationUrl,fixture:fixtureSnapshot(row),content:generateContentPack(row),channels:[],createdAt:'2026-09-22T12:00:00Z'};}

describe('Traffic Engine V1 social asset',()=>{
  it('has the required 9:16 dimensions and deterministic critical text',()=>{
    expect(socialAssetSize).toEqual({width:1080,height:1920});
    const first=renderToStaticMarkup(createSocialAssetElement(item())),second=renderToStaticMarkup(createSocialAssetElement(item()));
    expect(first).toBe(second);expect(first).toContain('Associação Desportiva Ferroviária do Vale');expect(first).toContain('Brasileirão Série A');expect(first).toContain('Compare as odds no LivaSports');
  });
  it('renders a real PNG response at 1080×1920',async()=>{
    const logo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const element=createSocialAssetElement(item(logo));
    const warn=vi.spyOn(console,'warn'),error=vi.spyOn(console,'error');
    const response=new ImageResponse(element,socialAssetSize);
    const bytes=new Uint8Array(await response.arrayBuffer());
    const renderWarnings=[...warn.mock.calls,...error.mock.calls].flat().join(' ');warn.mockRestore();error.mockRestore();
    expect(renderWarnings).not.toContain('Invalid value "210"');
    expect(response.headers.get('content-type')).toContain('image/png');expect(bytes.length).toBeGreaterThan(20_000);
    expect([...bytes.slice(1,4)]).toEqual([80,78,71]);
  },15_000);
  it('uses the governed .com lockup and never exposes stored bookmaker provenance',()=>{
    const stored=item();stored.fixture.odds.bookmakers=[{slug:'betano',name:'Betano hidden insurance'}];stored.fixture.odds.label='internal native source';
    const output=renderToStaticMarkup(createSocialAssetElement(stored));
    expect(output).toContain('>.com</span>');expect(output).not.toMatch(/Betano|hidden insurance|native source/);
  });
});
