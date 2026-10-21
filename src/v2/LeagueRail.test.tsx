import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {describe,it,expect} from 'vitest';
import {LeagueRail} from './LeagueRail';
describe('compact competition identities',()=>{
  it.each(['en','mx','br'] as const)('preserves twelve crawlable %s destinations and authentic full names',locale=>{
    const $=load(renderToStaticMarkup(<LeagueRail locale={locale}/>));
    expect($('a')).toHaveLength(12);expect($('img')).toHaveLength(0);
    expect($('a strong').toArray().map(e=>$(e).text())).toEqual(['Liga MX','Liga BetPlay','Liga 1','Champions League','NBA','EuroLeague','MLB','NFL','NHL','UFC','ATP','WTA']);
    expect($('a[title="National Basketball Association"]')).toHaveLength(1);
    expect(new Set($('a').toArray().map(e=>$(e).attr('href'))).size).toBe(12);
    expect($('a').toArray().every(e=>$(e).attr('href')?.startsWith(`/${locale}/`))).toBe(true);
    expect($('[role="combobox"]')).toHaveLength(0);
  });
});
