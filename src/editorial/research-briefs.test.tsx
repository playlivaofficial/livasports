import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {Newsroom} from './Newsroom';
import {v3NewsDrafts} from './v3-seed';
import {dailyResearchBriefs} from './daily-briefs';
import {verifiedDiscoveryBriefs} from './discovery-briefs';

describe('private, manually reviewed research briefs',()=>{
  it('offers all private briefs in the owner editor without selecting or publishing one',()=>{
    const $=load(renderToStaticMarkup(<Newsroom initial={[]} initialTime="2026-10-19T12:00:00.000Z"/>));
    const help=$('details').filter((_,element)=>$(element).find('summary').text()==='Prepared research briefs — unpublished');
    expect(help.find('option')).toHaveLength(v3NewsDrafts.length+dailyResearchBriefs.length+verifiedDiscoveryBriefs.length+1);
    expect(help.text()).toContain('does not save, approve or publish');
    expect($('button').filter((_,button)=>$(button).text()==='Publish reviewed version').is('[disabled]')).toBe(true);
    expect($('.ed-draft-list').text()).not.toContain(v3NewsDrafts[0].title.en);
    expect($('.ed-draft-preview')).toHaveLength(0);
  });
  it('keeps acquisition separate from runtime publication and retains specific archive captions',()=>{
    for(const file of ['server.ts','repository.ts','seed.ts'])expect(readFileSync(`src/editorial/${file}`,'utf8')).not.toContain('v3NewsDrafts');
    const images=v3NewsDrafts.filter(item=>item.image!=='none');
    expect(images.map(item=>item.image)).toEqual(['basketball-arena','ufc-octagon','tennis-court']);
    for(const item of images){expect(item.featured).toBe(false);expect(item).not.toHaveProperty('verifiedAt');}
    expect(images[0].imageCaption.en).toContain('2008');
    expect(images[1].imageCaption.en).toContain('Not the Edmonton 2026 event');
    expect(images[2].imageCaption.en).toContain('not the Wuhan final');
  });
});
