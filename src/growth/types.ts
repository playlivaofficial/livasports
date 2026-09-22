import type {FixturePriority,FixtureSignals} from './scoring';
import type {GrowthChannel} from './config';

export interface GrowthOddsBookmaker {slug:string;name:string;}
export interface GrowthOddsSummary {
  bookmakers:GrowthOddsBookmaker[];
  count:number;
  label:string;
}
export interface GrowthFixture {
  signals:FixtureSignals;
  destinationPath:string;
  destinationUrl:string;
  odds:GrowthOddsSummary;
}

export interface RankedGrowthFixture extends GrowthFixture {priority:FixturePriority;}

export interface ContentScreen {order:number;durationSeconds:number;headline:string;body:string;}
export interface FixtureFact {label:string;value:string;}
export interface GrowthContentPack {
  locale:'pt-BR';
  headline:string;
  hook:string;
  script:string;
  screens:ContentScreen[];
  cta:string;
  captions:Record<GrowthChannel,string>;
  facts:FixtureFact[];
  generatedBy:'DETERMINISTIC_TEMPLATE';
  generatorVersion:number;
}

export interface GrowthFixtureSnapshot {
  fixtureId:string;
  publicId:string;
  home:{name:string;publicId:string;imageUrl:string|null};
  away:{name:string;publicId:string;imageUrl:string|null};
  competition:{name:string;slug:string};
  kickoff:string;
  rivalry:string|null;
  stage:string|null;
  standings:{homePosition:number|null;awayPosition:number|null;totalTeams:number|null}|null;
  odds:GrowthOddsSummary;
}

export type GrowthChannelStatus='DRAFT'|'APPROVED'|'REJECTED'|'PUBLISHED';
export interface GrowthChannelRecord {
  channel:GrowthChannel;
  status:GrowthChannelStatus;
  trackedUrl:string;
  approvedAt:string|null;
  rejectedAt:string|null;
  publishedAt:string|null;
}

export interface GrowthContentItem {
  id:string;
  fixtureId:string;
  revision:number;
  sourceHash:string;
  trigger:'AUTOMATIC'|'OWNER';
  priorityScore:number;
  scoreBreakdown:FixturePriority['lines'];
  reasons:string[];
  canonicalUrl:string;
  fixture:GrowthFixtureSnapshot;
  content:GrowthContentPack;
  channels:GrowthChannelRecord[];
  createdAt:string;
}

export interface GrowthDashboard {
  generatedAt:string;
  social:RankedGrowthFixture[];
  content:RankedGrowthFixture[];
  items:GrowthContentItem[];
  considered:number;
  producible:number;
}
