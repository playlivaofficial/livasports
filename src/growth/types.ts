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
  /** Recent immutable creative choices involving either club; never an acquisition scoring input. */
  creativeHistory?:Array<{channel:GrowthVideoChannel;creative:GrowthCreativeDirection}>;
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
export interface GrowthVideoScene {order:number;startSeconds:number;durationSeconds:number;template:GrowthCreativeTemplate;visual:'HOOK'|'MATCHUP'|'PLAYER'|'CONTEXT'|'EDITORIAL_DATA'|'ODDS'|'CTA'|'WATCHLIST';assets:GrowthSceneAsset[];headline:string;subtitle:string;voiceover:string;transition:'CUT'|'FADE'|'SLIDE';}
export interface GrowthCreativeDirection {
  version:'PREMIUM_1';scenery:string[];characters:'LIVA_ORIGINAL'|'NONE';poses:string[];
  promo:'DISCOVER'|'CONTINUE'|'EXPLORE';hookFamily:string;ctaFamily:string;
  family?:'CHARACTER_FOOTBALL_WORLD'|'CREST_EDITORIAL'|'LICENSED_PLAYER';
  identities?:Array<'curly'|'fade'>;
  palettes?:{home:import('./palette').TeamPalette;away:import('./palette').TeamPalette};
  historyConsidered?:number;
  /** Premium Motion V1 sound direction, chosen with the rest of the creative so history can rotate it. */
  audio?:import('./audio-design').AudioDirection;
}
export interface GrowthRenderVoice {mode:string;provider:string;lines:number;degradedReason:string|null;voiceId?:string;
  cache?:{memoryHits:number;storeHits:number;synthesized:number;characters:number};}
export interface GrowthAudioSource {id:string;file:string;sha256:string|null;origin:'ORIGINAL_PROCEDURAL';license:string;}
export interface GrowthRenderMetadata {
  socialProofs?:Partial<Record<GrowthVideoChannel,SocialAssetProof>>;
  voice:GrowthRenderVoice;
  characterMode:'LIVA_ORIGINAL'|'CREST_FALLBACK'|'NONE';scenery:string[];durationSeconds:number;renderMs:number;
  /** Wall-clock per render stage, so serverless headroom is measured in production, not guessed. */
  stages?:{narrationMs:number;layersMs:number;audioMs:number;encodeMs:number};
  sceneTiming:Array<{order:number;startSeconds:number;durationSeconds:number;audioSeconds:number;voiceStartSeconds?:number}>;
  /** Premium Motion V1 (absent on older renders). */
  motion?:{version:string;grammar:string;fps:number;transitions:string[];atmosphere:string[][];bleed:number;encoder:{preset:string;crf:number;maxVideoKbps:number}};
  audio?:{library:string;direction:import('./audio-design').AudioDirection;music:GrowthAudioSource|null;ambience:GrowthAudioSource|null;
    effects:Array<{id:string;atSeconds:number;gainDb:number}>;
    mix:{hierarchy:'VOICE>MUSIC>AMBIENCE';targetLufs:number;truePeakCeilingDb:number;musicDb:number;ambienceDb:number;sfxDb:number;
      ducking:{threshold:number;ratio:number;attackMs:number;releaseMs:number};measuredInputLufs:number|null;outputLufs:number|null;outputTruePeakDb:number|null;loudnessRange:number|null}};
}
export interface GrowthPlatformDraft {channel:GrowthVideoChannel;title:string;description:string;hook:string;script:string;caption:string;hashtags:string[];cta:string;template:GrowthCreativeTemplate;scenes:GrowthVideoScene[];creative?:GrowthCreativeDirection;
  social?:{policyVersion:string;mode:'EDITORIAL';coverText:string;altText:string;sourceFixtureId:string;generatedAt:string;targetGeo:string;metadata:Record<string,string>};}
export type GrowthAssetKind='MASTER_VIDEO'|'STORY_IMAGE'|'FEED_IMAGE';
export interface GrowthCanonicalAsset {id:string;kind:GrowthAssetKind;creativeVersion:string;mimeType:'video/mp4'|'image/png';width:1080;height:1920|1350;sha256:string;byteLength:number;generatedAt:string;renderMetadata?:GrowthRenderMetadata;}
export interface GrowthReadiness {score:number;state:'READY'|'NEEDS_REVIEW'|'FALLBACK';reasons:string[];fallbackApplied:boolean;}
export interface GrowthPlatformAsset {channel:GrowthVideoChannel;creativeVersion?:string|null;status:'READY'|'FAILED'|'PENDING';mimeType:string|null;sha256:string|null;byteLength:number|null;generatedAt:string|null;errorCode:string|null;renderMetadata?:GrowthRenderMetadata;socialProof?:SocialAssetProof;coverSha256?:string|null;}
export interface SocialAssetProof {policyVersion:string;status:'ready'|'blocked_for_review';rejectionReasons:string[];draftIdentity:string;videoSha256:string;coverSha256:string;feedSha256:string;checkedAt:string;}
export interface SocialContentSource {fixture:GrowthFixtureSnapshot;teams:{home:GrowthFixtureSnapshot['home'];away:GrowthFixtureSnapshot['away']};competition:GrowthFixtureSnapshot['competition'];locale:'pt-BR';stats:{standings:GrowthFixtureSnapshot['standings']};form:GrowthStorySignals['form']|null;h2h:null;markets:GrowthOddsSummary;operators:GrowthOddsBookmaker[];targetGeo:'BR';generatedAt:string;}
export interface GrowthContentPack {
  assetModel?:'MASTER_V1'|'SOCIAL_V2';
  socialSource?:SocialContentSource;
  /** One strict editorial master; platform posting copy has independent policy proofs. */
  masterSocial?:GrowthPlatformDraft;
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
  home:{name:string;publicId:string;imageUrl:string|null;slug?:string};
  away:{name:string;publicId:string;imageUrl:string|null;slug?:string};
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
  canonicalAssets?:GrowthCanonicalAsset[];
  creativeVersion?:string|null;
  contentIdentity?:string|null;
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
  publishing?:import('./manual-publishing').PublishingOverview;
  generatedAt:string;
  social:RankedGrowthFixture[];
  content:RankedGrowthFixture[];
  items:GrowthContentItem[];
  considered:number;
  producible:number;
}
