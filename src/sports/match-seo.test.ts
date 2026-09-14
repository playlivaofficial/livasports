import {expect,it} from 'vitest';
import type {MatchHeaderView} from '@/match-center/types';
import {FixtureStatus} from '@/domain/enums';
import {matchDateDescription,sportsMatchSchema} from './match-seo';
const header={publicId:'0123456789abcdef',home:{name:'Home',publicId:'1123456789abcdef'},away:{name:'Away',publicId:'2123456789abcdef'},competition:'Liga MX',competitionSlug:'liga-mx',seasonId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',kickoff:'2026-09-21T00:00:00.000Z',status:FixtureStatus.SCHEDULED,venue:null,venueCity:null} as MatchHeaderView;
it('keeps reciprocal entity identities and the historical competition in all locale breadcrumbs',()=>{
  for(const locale of ['br','mx','en'] as const){
    const [event,breadcrumb]=sportsMatchSchema(locale,header);
    expect(event.startDate).toBe(header.kickoff);expect(event.eventStatus).toBe('https://schema.org/EventScheduled');
    expect(event.url).toContain('/'+locale+'/');expect(event.location).toBeUndefined();
    expect(breadcrumb.itemListElement?.[1].item).toContain('season='+header.seasonId);
    expect(breadcrumb.itemListElement?.[2].item).toBe(event.url);
    expect(JSON.stringify(event)).not.toMatch(/offers|broadcast|endDate/);
  }
});
it('uses schema status URLs only where a matching status exists',()=>{
  expect(sportsMatchSchema('en',{...header,status:FixtureStatus.CANCELLED})[0].eventStatus).toBe('https://schema.org/EventCancelled');
  expect(sportsMatchSchema('en',{...header,status:FixtureStatus.POSTPONED})[0].eventStatus).toBe('https://schema.org/EventPostponed');
  expect(sportsMatchSchema('en',{...header,status:FixtureStatus.FINISHED})[0].eventStatus).toBeUndefined();
});
it('includes a factual kickoff date and explicit stable locale timezone in metadata',()=>{
  expect(matchDateDescription('en',header)).toContain('Sep 21, 2026');expect(matchDateDescription('en',header)).toContain('UTC');
  expect(matchDateDescription('br',header)).toContain('America/Sao Paulo');
});
