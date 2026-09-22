import {describe,expect,it} from 'vitest';
import type {MatchHeaderView} from '@/match-center/types';
import {FixtureStatus} from '@/domain/enums';
import {matchDateDescription,matchSchemaParts,matchSeoDescription,matchSeoTitle,sportsMatchSchema} from './match-seo';

const header={publicId:'0123456789abcdef',home:{name:'Home',publicId:'1123456789abcdef'},away:{name:'Away',publicId:'2123456789abcdef'},
  competition:'Liga MX',competitionSlug:'liga-mx',season:'2026',seasonId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  kickoff:'2026-09-21T00:00:00.000Z',status:FixtureStatus.SCHEDULED,venue:null,venueCity:null} as MatchHeaderView;
const located={...header,venue:'Estadio Azteca',venueCity:'Ciudad de México'} as MatchHeaderView;

describe('M1 SportsEvent validity',()=>{
  it('drops the whole SportsEvent when no truthful location exists and still ships the breadcrumb',()=>{
    const {event,breadcrumb}=matchSchemaParts('en',header);
    expect(event).toBeNull();
    expect(sportsMatchSchema('en',header)).toEqual([breadcrumb]);
    expect(breadcrumb['@type']).toBe('BreadcrumbList');
  });
  it('emits the stored venue with its city as a Place',()=>{
    expect(matchSchemaParts('en',located).event?.location)
      .toEqual({'@type':'Place',name:'Estadio Azteca',address:{'@type':'PostalAddress',addressLocality:'Ciudad de México'}});
  });
  it('falls back to the stored city when no venue name exists',()=>{
    expect(matchSchemaParts('en',{...header,venueCity:'Guadalajara'} as MatchHeaderView).event?.location)
      .toEqual({'@type':'Place',name:'Guadalajara',address:{'@type':'PostalAddress',addressLocality:'Guadalajara'}});
  });
  it('emits a venue without an address when no city is stored',()=>{
    expect(matchSchemaParts('en',{...header,venue:'Arena'} as MatchHeaderView).event?.location).toEqual({'@type':'Place',name:'Arena'});
  });
  it('never invents endDate, offers, broadcast, organizer or a non-existent completed status',()=>{
    expect(JSON.stringify(matchSchemaParts('en',located).event)).not.toMatch(/offers|broadcast|organizer|endDate|EventCompleted/);
  });
  it('carries the truthful extras the fixture does support',()=>{
    const event=matchSchemaParts('en',located).event;
    expect(event?.performer).toEqual([event?.homeTeam,event?.awayTeam]);
    expect(event?.image).toBe('https://livasports.com/opengraph-image.png');
    expect(event?.description).toBe(matchSeoDescription('en',located));
  });
});

it('maps only the five statuses schema.org actually defines',()=>{
  const status=(value:FixtureStatus)=>matchSchemaParts('en',{...located,status:value}).event?.eventStatus;
  expect(status(FixtureStatus.CANCELLED)).toBe('https://schema.org/EventCancelled');
  expect(status(FixtureStatus.POSTPONED)).toBe('https://schema.org/EventPostponed');
  // EventStatusType has no completed member, so a played match keeps "proceeded as scheduled".
  expect(status(FixtureStatus.FINISHED)).toBe('https://schema.org/EventScheduled');
  expect(status(FixtureStatus.LIVE)).toBe('https://schema.org/EventScheduled');
  expect(status(FixtureStatus.ABANDONED)).toBeUndefined();
});

it('points the competition breadcrumb at the canonical hub URL, never a default-season twin',()=>{
  for(const locale of ['br','mx','en'] as const){
    const {breadcrumb}=matchSchemaParts(locale,header);
    const competition=breadcrumb.itemListElement[1].item;
    expect(competition).toContain('competition=liga-mx');
    expect(competition).not.toContain('season=');
    expect(breadcrumb.itemListElement[2].item).toContain(`/${locale}/`);
  }
});

describe('M1 localized match metadata',()=>{
  it('carries both teams, the competition, its season and the localized odds intent',()=>{
    expect(matchSeoTitle('br',header)).toBe('Home x Away — Odds e estatísticas | Liga MX 2026');
    expect(matchSeoTitle('mx',header)).toBe('Home x Away — Cuotas y estadísticas | Liga MX 2026');
    expect(matchSeoTitle('en',header)).toBe('Home x Away — Odds and stats | Liga MX 2026');
  });
  it('switches to result intent once the match has been played',()=>{
    const finished={...header,status:FixtureStatus.FINISHED} as MatchHeaderView;
    expect(matchSeoTitle('br',finished)).toContain('Resultado e estatísticas');
    expect(matchSeoTitle('mx',finished)).toContain('Resultado y estadísticas');
    expect(matchSeoTitle('en',finished)).toContain('Result and stats');
  });
  it('omits the season when the fixture has none instead of inventing a year',()=>{
    expect(matchSeoTitle('en',{...header,season:null} as MatchHeaderView)).toBe('Home x Away — Odds and stats | Liga MX');
  });
  it('keeps titles readable rather than keyword-stuffed',()=>{
    for(const locale of ['br','mx','en'] as const){
      const title=matchSeoTitle(locale,header);
      expect(title.length).toBeLessThanOrEqual(75);
      expect(title.toLowerCase().match(/odds|cuotas/g)?.length??0).toBeLessThanOrEqual(1);
    }
  });
  it('describes the match with stored facts and no bookmaker or broadcast claim',()=>{
    const description=matchSeoDescription('br',header);
    expect(description).toContain('Home x Away');expect(description).toContain('Liga MX 2026');
    expect(description).not.toMatch(/transmiss|ao vivo na TV|palpite|previs/i);
  });
});

it('includes a factual kickoff date and explicit stable locale timezone in metadata',()=>{
  expect(matchDateDescription('en',header)).toContain('Sep 21, 2026');expect(matchDateDescription('en',header)).toContain('UTC');
  expect(matchDateDescription('br',header)).toContain('America/Sao Paulo');
});
