import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {describe,it,expect} from 'vitest';
import {LeagueRail} from './LeagueRail';
describe('compact competition identities',()=>{
  it.each(['en','mx','br'] as const)('preserves thirteen crawlable %s destinations and reviewed identities',locale=>{
    const $=load(renderToStaticMarkup(<LeagueRail locale={locale}/>));
    expect($('a')).toHaveLength(13);expect($('img')).toHaveLength(4);
    expect($('[data-identity="bundesliga-wordmark"] img').attr('src')).toBe('/sports-identities/bundesliga-wordmark.png');
    expect($('a strong').toArray().map(e=>$(e).text())).toEqual(['Liga MX','Liga BetPlay','Liga 1','Champions League','Bundesliga','NBA','EuroLeague','MLB','NFL','NHL','UFC','ATP','WTA']);
    expect($('a[title="National Basketball Association"]')).toHaveLength(1);
    expect(new Set($('a').toArray().map(e=>$(e).attr('href'))).size).toBe(13);
    expect($('a').toArray().every(e=>$(e).attr('href')?.startsWith(`/${locale}/`))).toBe(true);
    expect($('[role="combobox"]')).toHaveLength(0);
  });
});
