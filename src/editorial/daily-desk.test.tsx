import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from 'cheerio';
import {describe,expect,it} from 'vitest';
import {initialNews} from './seed';
import {newsSports,topicsForSport,transitionNews,validSourceUrl,type NewsRecord,type NewsSport} from './model';
import {dailyEditorialDesk,dailySourceDesks} from './daily-desk';
import {DailyDesk} from './DailyDesk';

const now=new Date('2026-10-21T12:00:00Z');
function record(sport:NewsSport):NewsRecord{return {slug:`desk-${sport}`,draft:{...structuredClone(initialNews[0]),slug:`desk-${sport}`,sport,competition:topicsForSport(sport)[0],image:'none',sourcePublishedOn:'2026-10-21'},published:null,revision:1,reviewedAt:null,reviewedRevision:null,archived:false};}
const published=(item:NewsRecord)=>transitionNews(transitionNews(item,'review',undefined,now),'publish',undefined,now);
describe('daily manual newsroom operation',()=>{
  it('provides an actionable source desk for all seven sports without inventing publications',()=>{
    const queue=dailyEditorialDesk([],now);expect(queue.map(item=>item.sport)).toEqual([...newsSports]);
    expect(queue.every(item=>item.action==='research'&&item.todayStories===0&&item.latest===null)).toBe(true);
    for(const source of Object.values(dailySourceDesks).flat())expect(validSourceUrl(source.url)).toBe(true);
  });
  it('keeps draft review, reviewed readiness and actual publication separate',()=>{
    const draft=record('football'),ready=transitionNews(record('basketball'),'review',undefined,now),live=published(record('tennis'));
    const queue=dailyEditorialDesk([draft,ready,live],now);
    expect(queue.find(item=>item.sport==='football')).toMatchObject({action:'review-drafts',needsReview:1,todayStories:0});
    expect(queue.find(item=>item.sport==='basketball')).toMatchObject({action:'publish-reviewed',ready:1,todayStories:0});
    expect(queue.find(item=>item.sport==='tennis')).toMatchObject({action:'check-for-updates',todayStories:1});
  });
  it('does not label an old source republished today as today’s news',()=>{
    const old=record('football');old.draft.sourcePublishedOn='2026-10-18';
    expect(dailyEditorialDesk([published(old)],now)[0]).toMatchObject({todayStories:0,latest:'2026-10-18',action:'research'});
  });
  it('daily rollover uses source dates, not yesterday’s dashboard counts',()=>{
    const live=published(record('football'));
    expect(dailyEditorialDesk([live],new Date('2026-10-22T00:00:00Z'))[0]).toMatchObject({today:'2026-10-22',todayStories:0,action:'research'});
  });
  it('excludes archived and unsafe public stories and expires draft review after 24 hours',()=>{
    const archived={...published(record('football')),archived:true};
    const invalid=published(record('mma'));invalid.published!.sourcePublishedOn='2026-10-30';
    const ready=transitionNews(record('basketball'),'review',undefined,now);
    const queue=dailyEditorialDesk([archived,invalid,ready],new Date(now.getTime()+86400001));
    expect(queue[0].latest).toBeNull();expect(queue.find(item=>item.sport==='mma')!.todayStories).toBe(0);
    expect(queue.find(item=>item.sport==='basketball')).toMatchObject({ready:0,needsReview:1,action:'review-drafts'});
  });
  it('renders seven source groups and safe private draft actions, not a publish shortcut',()=>{
    const $=load(renderToStaticMarkup(<DailyDesk records={[]} now={now} onStartStory={()=>{}}/>));
    expect($('.ed-desk-card')).toHaveLength(7);expect($('button')).toHaveLength(7);
    expect($('a[target="_blank"]').length).toBeGreaterThanOrEqual(7);
    expect($('a').toArray().every(link=>$(link).attr('rel')==='noopener noreferrer')).toBe(true);
    expect($.text()).toContain('manual exception desk');expect($.text()).toContain('does not claim sources were checked today');
  });
});
