/**
 * Traffic Engine V1 — every weight the priority engine uses lives here, so tuning Brazil's traffic
 * strategy is one edit in one file rather than numbers scattered through queries and components.
 *
 * V1.1 makes this the single acquisition-priority signal. Social generation and explicit SEO prominence
 * both consume this score; the normal sports board still keeps chronological usability inside its lists.
 *
 * Nothing here is a trend, a prediction or a popularity metric we cannot source: competition and club
 * tiers are an editorial acquisition decision, and the rivalries are long-established Brazilian derbies.
 */

/** Component keys, in the order the owner UI explains them. */
export const SCORE_COMPONENTS=['competition','clubs','rivalry','stage','standings','proximity','odds','data','destination'] as const;
export type ScoreComponent=typeof SCORE_COMPONENTS[number];

/**
 * Relative weight of each component. A component contributes `weight × strength` where strength is
 * normalised to 0..1, so the maximum achievable score is the sum of these weights.
 */
export const SCORE_WEIGHTS:Record<ScoreComponent,number>={
  competition:30,  // which tournament it is — the strongest single signal in Brazil
  clubs:26,        // who is playing; a big club carries a fixture on its own
  rivalry:14,      // a real derby outperforms both teams' individual pull
  stage:10,        // finals and knockouts concentrate attention
  standings:6,     // title race or relegation fight, only where standings exist
  proximity:8,     // a fixture nobody can watch soon converts poorly
  odds:10,         // no odds means the destination page cannot do its commercial job
  data:4,          // a thin match page is a poor landing page
  destination:6,   // the canonical page must actually be worth sending traffic to
};

/**
 * Brazil traffic tiers by registry slug, 1.0 (highest) down. Unlisted enabled competitions score
 * `COMPETITION_FALLBACK`, so a new registry entry degrades gracefully instead of vanishing.
 */
export const COMPETITION_TRAFFIC_TIERS:Readonly<Record<string,number>>={
  'brasileirao-serie-a':1.00,
  'copa-libertadores':0.94,
  'champions-league':0.88,
  'copa-do-brasil':0.82,
  'premier-league':0.76,
  'brasileirao-serie-b':0.66,
  'la-liga':0.62,
  'copa-sudamericana':0.58,
  'serie-a-italy':0.54,
  'bundesliga':0.50,
  'ligue-1':0.42,
  'europa-league':0.42,
  'paulista-a1':0.40,
  'carioca-serie-a':0.38,
  'liga-portugal':0.32,
  'conference-league':0.30,
  'copa-do-nordeste':0.30,
  'argentina-primera-division':0.28,
  'eredivisie':0.22,
  'liga-mx':0.20,
};
export const COMPETITION_FALLBACK=0.15;

/**
 * Brazilian club pull by team slug (the slug the profile route already uses, so it is accent-safe).
 * Tier 1 are the four national draws; tier 2 are the other major clubs in the registry.
 */
export const CLUB_TIERS:Readonly<Record<string,number>>={
  flamengo:1.00,corinthians:0.96,palmeiras:0.94,'sao-paulo':0.90,
  'vasco-da-gama':0.74,santos:0.72,cruzeiro:0.70,gremio:0.68,'atletico-mineiro':0.68,
  internacional:0.66,botafogo:0.66,fluminense:0.64,bahia:0.58,
  'athletico-pr':0.50,bragantino:0.44,vitoria:0.44,coritiba:0.40,fortaleza:0.44,
  goias:0.38,ceara:0.40,sport:0.40,'atletico-go':0.36,juventude:0.34,mirassol:0.32,
};
export const CLUB_FALLBACK=0.12;
/** Provider display-name variants collapse onto the same editorial club key. */
export const CLUB_ALIASES:Readonly<Record<string,string>>={
  'sao-paulo-fc':'sao-paulo','sao-paulo-fc-sp':'sao-paulo',
  'cr-flamengo':'flamengo','flamengo-rj':'flamengo',
  'sc-corinthians-paulista':'corinthians','corinthians-sp':'corinthians',
  'se-palmeiras':'palmeiras','palmeiras-sp':'palmeiras',
  'cr-vasco-da-gama':'vasco-da-gama','vasco-da-gama-rj':'vasco-da-gama',
  'atletico-mg':'atletico-mineiro','clube-atletico-mineiro':'atletico-mineiro',
  'gremio-fbpa':'gremio','sc-internacional':'internacional','botafogo-fr':'botafogo',
  'fluminense-fc':'fluminense','ec-bahia':'bahia',
};
export const clubKey=(slug:string)=>CLUB_ALIASES[slug]??slug;
/** A second big club adds pull, but two big names are not twice one big name. */
export const SECOND_CLUB_SHARE=0.45;

export interface Rivalry {readonly clubs:readonly [string,string];readonly name:string;readonly strength:number;}
/** Long-established Brazilian derbies. Named so the owner UI can say which derby it is. */
export const RIVALRIES:readonly Rivalry[]=[
  {clubs:['corinthians','palmeiras'],name:'Derby Paulista',strength:1.00},
  {clubs:['flamengo','fluminense'],name:'Fla-Flu',strength:0.96},
  {clubs:['corinthians','sao-paulo'],name:'Majestoso',strength:0.94},
  {clubs:['flamengo','vasco-da-gama'],name:'Clássico dos Milhões',strength:0.92},
  {clubs:['gremio','internacional'],name:'Grenal',strength:0.92},
  {clubs:['palmeiras','sao-paulo'],name:'Choque-Rei',strength:0.90},
  {clubs:['atletico-mineiro','cruzeiro'],name:'Clássico Mineiro',strength:0.88},
  {clubs:['corinthians','santos'],name:'Clássico Alvinegro',strength:0.82},
  {clubs:['palmeiras','santos'],name:'Clássico da Saudade',strength:0.80},
  {clubs:['sao-paulo','santos'],name:'San-São',strength:0.78},
  {clubs:['botafogo','flamengo'],name:'Clássico da Rivalidade',strength:0.78},
  {clubs:['botafogo','vasco-da-gama'],name:'Clássico da Amizade',strength:0.72},
  {clubs:['fluminense','vasco-da-gama'],name:'Clássico dos Gigantes',strength:0.72},
  {clubs:['bahia','vitoria'],name:'Ba-Vi',strength:0.70},
  {clubs:['athletico-pr','coritiba'],name:'Atletiba',strength:0.66},
];
const rivalryKey=(a:string,b:string)=>[clubKey(a),clubKey(b)].sort().join('|');
const RIVALRY_INDEX=new Map(RIVALRIES.map(r=>[rivalryKey(r.clubs[0],r.clubs[1]),r]));
export function rivalryFor(homeSlug:string,awaySlug:string):Rivalry|null{return RIVALRY_INDEX.get(rivalryKey(homeSlug,awaySlug))??null;}

/**
 * Knockout weight by the provider's stage/round text. Matched case- and accent-insensitively against
 * the stored `stage_name`/`round_name`; an unmatched stage simply scores 0 rather than guessing.
 */
export const STAGE_PATTERNS:readonly (readonly [RegExp,number,string])[]=[
  [/(semi.?final|semifinal)/i,0.85,'Semi-final'],
  [/(quarter.?final|quartas)/i,0.70,'Quarter-final'],
  [/(oitavas|round of 16|1\/8)/i,0.58,'Round of 16'],
  [/(^|\s)final(\s|$)/i,1.00,'Final'],
  [/(playoff|play-off|repechage|repescagem)/i,0.45,'Play-off'],
  [/(knockout|mata.?mata|eliminat)/i,0.40,'Knockout'],
  [/(group stage|fase de grupos|grupo)/i,0.18,'Group stage'],
];

/** Table context, only applied when standings rows exist for the season. */
export const STANDINGS_RULES={
  /** Positions 1..N are treated as a title race. */
  titlePositions:4,
  /** The bottom N positions are treated as a relegation fight. */
  relegationPositions:4,
  titleStrength:1.0,
  relegationStrength:0.7,
  /** Both teams involved in the same fight is worth more than one. */
  bothTeamsBonus:0.3,
} as const;

/** Kickoff proximity, in hours from now, mapped to strength. Beyond the last entry scores 0. */
export const PROXIMITY_CURVE:readonly (readonly [number,number])[]=[[6,1.0],[24,0.92],[48,0.75],[72,0.55],[120,0.35],[168,0.2]];

/** Odds coverage: how many distinct bookmakers must be priced for full strength. */
export const ODDS_FULL_COVERAGE=2;

/** Shortlist shape and the diversity rule that stops one competition filling the whole list. */
export const SHORTLIST={
  socialSize:5,
  contentSize:10,
  /** Maximum new fixtures rendered by one scheduled serverless invocation. The complete Top 10
   * still powers SEO; three daily runs advance through duplicate-safe content batches. */
  generationBatchSize:3,
  /** How far ahead a fixture may be and still be shortlisted. */
  horizonHours:168,
  /** Fixtures that kicked off within this many hours stay eligible (a match in play still draws traffic). */
  graceHours:3,
  /** At most this many fixtures from one competition in the social top list. */
  maxPerCompetitionSocial:2,
  /** At most this many fixtures from one competition in the broader content list. */
  maxPerCompetitionContent:4,
  /** A capped fixture may still displace the last choice when this many points stronger. */
  diversityOverrideGap:12,
  /** A fixture already produced within this many days is not offered again. */
  duplicateWindowDays:7,
} as const;

/** The score a fixture must beat to be worth producing at all. */
export const MINIMUM_SCORE=18;

/** Deterministic content/attribution contract shared by generation, persistence and the owner UI. */
export const CONTENT_GENERATOR_VERSION=2;
/** Increments when deterministic V1.1 selection/output policy changes without changing the storage schema. */
export const CONTENT_POLICY_VERSION=2;
export const GROWTH_CHANNELS=['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS','EDITORIAL'] as const;
export type GrowthChannel=typeof GROWTH_CHANNELS[number];
export const VIDEO_CHANNELS=['TIKTOK','INSTAGRAM_REELS','YOUTUBE_SHORTS'] as const;
export type GrowthVideoChannel=typeof VIDEO_CHANNELS[number];
export const CHANNEL_UTM:Readonly<Record<GrowthChannel,{source:string;medium:'social';label:string}>>={
  TIKTOK:{source:'tiktok',medium:'social',label:'TikTok'},
  INSTAGRAM_REELS:{source:'instagram',medium:'social',label:'Instagram Reels'},
  YOUTUBE_SHORTS:{source:'youtube',medium:'social',label:'YouTube Shorts'},
  EDITORIAL:{source:'editorial_social',medium:'social',label:'Social editorial'},
};
export const UTM_CAMPAIGN='traffic_engine_v1';

/** Centrally editable platform behavior. Copy generators consume these constraints; they are not prompts. */
export const PLATFORM_PROFILES={
  TIKTOK:{label:'TikTok',durationSeconds:20,hookSeconds:2,tone:'CONVERSATIONAL',maxHashtags:4,brandIntro:false},
  INSTAGRAM_REELS:{label:'Instagram Reels',durationSeconds:24,hookSeconds:3,tone:'PREMIUM',maxHashtags:5,brandIntro:true},
  YOUTUBE_SHORTS:{label:'YouTube Shorts',durationSeconds:25,hookSeconds:1,tone:'INFORMATIONAL',maxHashtags:4,brandIntro:false},
} as const satisfies Record<GrowthVideoChannel,{label:string;durationSeconds:number;hookSeconds:number;tone:'CONVERSATIONAL'|'PREMIUM'|'INFORMATIONAL';maxHashtags:number;brandIntro:boolean}>;

export const QUALITY={publishReady:68,needsReview:50,playerEvidenceMinimum:22,oddsGapMinimum:0.18} as const;
export const VIDEO={width:1080,height:1920,fps:12,subtitleTop:1320,subtitleBottom:1640,maxRenderBytes:8_000_000} as const;

/** Reserved boundary for future verified Search Console/social-trend inputs. No source means no adjustment. */
export const VERIFIED_TREND_PROVIDERS=[] as readonly string[];

// ---------------------------------------------------------------------------
// V1.2 — Brazilian Portuguese narration
// ---------------------------------------------------------------------------
export const VOICE_MODES=['ENERGETIC','EDITORIAL'] as const;
export type GrowthVoiceMode=typeof VOICE_MODES[number];
/**
 * Narration settings. Everything here is tuning, never a credential: the ElevenLabs key is read from
 * `process.env.ELEVENLABS_API_KEY` at call time and never appears in configuration, logs or assets.
 * The budgets exist so narration can never push a render past the serverless limit V1.1 secured —
 * a video that runs out of synthesis budget ships with the lines it already has, captions intact.
 */
export const VOICE={
  baseUrl:'https://api.elevenlabs.io',
  /** Multilingual is the ElevenLabs model with proper Brazilian Portuguese pronunciation. */
  model:'eleven_multilingual_v2',
  language:'pt',
  outputFormat:'mp3_44100_128',
  requestTimeoutMs:15_000,
  /** Wall-clock ceiling for narrating one video, well inside the render budget. */
  videoBudgetMs:60_000,
  concurrency:3,
  maxCharacters:420,
  maxLinesPerVideo:6,
  maxClipBytes:2_000_000,
  /** Mixing levels; the voice always stays dominant over ambience and effects. */
  voiceGain:1.0,
  ambienceGain:0.12,
  effectGain:0.22,
  modes:{
    // Lower stability reads as livelier delivery; higher stability reads as measured and editorial.
    ENERGETIC:{stability:0.34,similarity:0.78,style:0.55},
    EDITORIAL:{stability:0.58,similarity:0.80,style:0.22},
  },
} as const;
/** Default narration voice per channel; TikTok wants energy, the other two want authority. */
export const CHANNEL_VOICE:Readonly<Record<GrowthVideoChannel,GrowthVoiceMode>>={
  TIKTOK:'ENERGETIC',INSTAGRAM_REELS:'EDITORIAL',YOUTUBE_SHORTS:'EDITORIAL',
};
