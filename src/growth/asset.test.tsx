import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ImageResponse} from 'next/og';
import {createSocialAssetElement,socialAssetSize} from './asset';
import {generateContentPack,fixtureSnapshot} from './content';
import {rankedFixture} from './fixtures.test-support';
import type {GrowthContentItem} from './types';

function item():GrowthContentItem{const row=rankedFixture({home:{slug:'long',name:'Associação Desportiva Ferroviária do Vale',publicId:'a'.repeat(16),imageUrl:null}});return {
  id:'11111111-1111-4111-8111-111111111111',fixtureId:row.signals.fixtureId,revision:1,sourceHash:'a'.repeat(64),trigger:'OWNER',priorityScore:row.priority.total,
  scoreBreakdown:row.priority.lines,reasons:row.priority.reasons,canonicalUrl:row.destinationUrl,fixture:fixtureSnapshot(row),content:generateContentPack(row),channels:[],createdAt:'2026-09-22T12:00:00Z'};}

describe('Traffic Engine V1 social asset',()=>{
  it('has the required 9:16 dimensions and deterministic critical text',()=>{
    expect(socialAssetSize).toEqual({width:1080,height:1920});
    const first=renderToStaticMarkup(createSocialAssetElement(item())),second=renderToStaticMarkup(createSocialAssetElement(item()));
    expect(first).toBe(second);expect(first).toContain('Associação Desportiva Ferroviária do Vale');expect(first).toContain('Brasileirão Série A');expect(first).toContain('Compare as odds no LivaSports');
  });
  it('renders a real PNG response at 1080×1920',async()=>{
    const response=new ImageResponse(createSocialAssetElement(item()),socialAssetSize);
    const bytes=new Uint8Array(await response.arrayBuffer());
    expect(response.headers.get('content-type')).toContain('image/png');expect(bytes.length).toBeGreaterThan(20_000);
    expect([...bytes.slice(1,4)]).toEqual([80,78,71]);
  },15_000);
});
