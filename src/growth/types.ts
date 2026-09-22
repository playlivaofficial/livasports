import type {FixturePriority,FixtureSignals} from './scoring';
import type {GrowthChannel,GrowthVideoChannel} from './config';

export interface GrowthOddsBookmaker {slug:string;name:string;}
export interface GrowthOddsSummary {
  bookmakers:GrowthOddsBookmaker[];
  count:number;
  label:string;
  /** Only visible, verified public identities. Hidden insurance and source provenance never enter copy. */
  publicBookmakers?:GrowthOddsBookmaker[];
  publicPriceGap?:number|null;
}
export interface GrowthPlayerStatistics {appearances:number|null;starts:number|null;minutes:number|null;goals:number|null;assists:number|null;}
export interface GrowthMediaRights {source:string|null;licenseStatus:'APPROVED'|'REJECTED'|'UNKNOWN'|'EXPIRED';commercialEligible:boolean;assetUrl:string|null;evidence:string|null;}
export interface GrowthPlayerCandidate {id:string;publicId:string;teamId:string;teamName:string;name:string;statistics:GrowthPlayerStatistics;evidenceScore:number;selectionReason:string;media:GrowthMediaRights;}
export interface GrowthTeamForm {played:number;wins:number;draws:number;losses:number;goalsFor:number;goalsAgainst:number;}
export interface GrowthStorySignals {players:{home:GrowthPlayerCandidate[];away:GrowthPlayerCandidate[]};form:{home:GrowthTeamForm|null;away:GrowthTeamForm|null};}
export interface GrowthFixture {
  signals:FixtureSignals;
  destinationPath:string;
  destinationUrl:string;
  odds:GrowthOddsSummary;
  storySignals?:GrowthStorySignals;
}

export interface RankedGrowthFixture extends GrowthFixture {priority:FixturePriority;}

export interface ContentScreen {order:number;durationSeconds:number;headline:string;body:string;}
export interface FixtureFact {label:string;value:string;}
export type GrowthStoryAngle='BIG_MATCH'|'PLAYER_VS_PLAYER'|'STAR_FOCUS'|'ODDS_GAP'|'TABLE_PRESSURE'|'DERBY_RIVALRY'|'TOP_MATCHES_TODAY'|'WEEKEND_WATCHLIST';
export type GrowthCreativeTemplate='PLAYER_CLASH'|'MATCH_CLASH'|'STAR_FOCUS'|'ODDS_COMPARISON'|'TOP_MATCHES_TODAY';
export interface GrowthStorySelection {angle:GrowthStoryAngle;template:GrowthCreativeTemplate;reason:string;}
export interface GrowthIntentCluster {primary:string;queries:string[];canonicalUrl:string;}
export interface GrowthSeoPriority {level:'TOP_5'|'TOP_10'|'STANDARD';rank:number;score:number;intent:GrowthIntentCluster;placements:string[];context:string;}
export interface GrowthSelectedPlayer {id:string;publicId:string;teamId:string;teamName:string;name:string;selectionReason:string;evidenceScore:number;statistics:GrowthPlayerStatistics;media:GrowthMediaRights;}
export interface GrowthSceneAsset {kind:'TEAM_CREST'|'PLAYER_IMAGE'|'PLAYER_SILHOUETTE'|'NONE';label:string;url:string|null;commercialEligible:boolean;}
export interface GrowthVideoScene {order:number;startSeconds:number;durationSeconds:number;template:GrowthCreativeTemplate;visual:'HOOK'|'MATCHUP'|'PLAYER'|'CONTEXT'|'ODDS'|'CTA'|'WATCHLIST';assets:GrowthSceneAsset[];headline:string;subtitle:string;voiceover:string;transition:'CUT'|'FADE'|'SLIDE';}
export interface GrowthPlatformDraft {channel:GrowthVideoChannel;title:string;description:string;hook:string;script:string;caption:string;hashtags:string[];cta:string;template:GrowthCreativeTemplate;scenes:GrowthVideoScene[];}
export interface GrowthReadiness {score:number;state:'READY'|'NEEDS_REVIEW'|'FALLBACK';reasons:string[];fallbackApplied:boolean;}
export interface GrowthPlatformAsset {channel:GrowthVideoChannel;status:'READY'|'FAILED'|'PENDING';mimeType:string|null;sha256:string|null;byteLength:number|null;generatedAt:string|null;errorCode:string|null;}
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
  version?:'V1.1';
  seo?:GrowthSeoPriority;
  story?:GrowthStorySelection;
  players?:GrowthSelectedPlayer[];
  platforms?:Record<GrowthVideoChannel,GrowthPlatformDraft>;
  readiness?:GrowthReadiness;
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
  platformAssets?:GrowthPlatformAsset[];
  supersedesItemId?:string|null;
  supersededAt?:string|null;
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
