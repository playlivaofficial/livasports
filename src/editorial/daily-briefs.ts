import type {NewsDraft} from './model';

/** Source-checked 2026-10-21. Private research drafts, never auto-imported or published.
 * Constrained sources permit only short original English briefs. Do not invent translations
 * or event photography; unavailable languages explicitly fall back to the original.
 */
export const dailyResearchBriefs:NewsDraft[]=[
  {
    slug:'world-series-matchup-confirmed-2026',sport:'baseball',competition:'mlb',country:'international',
    title:{en:'Brewers–Rays World Series matchup confirmed',es:'',pt:''},
    summary:{en:'Game 1 starts Friday in Milwaukee.',es:'',pt:''},
    body:{en:'The best-of-seven series will produce a first-time champion.',es:'',pt:''},
    sourceName:'MLB',sourceUrl:'https://www.mlb.com/news/rays-brewers-world-series-game-1-starting-lineups-and-pitching-matchup',sourcePublishedOn:'2026-10-20',
    image:'none',imageCaption:{en:'',es:'',pt:''},featured:false,originalLanguage:'en',
    translationReview:{en:{state:'pending',reviewedAt:null},es:{state:'unavailable',reviewedAt:null},pt:{state:'unavailable',reviewedAt:null}},
  },
  {
    slug:'sharks-montreal-overtime-october-2026',sport:'ice-hockey',competition:'nhl',country:'international',
    title:{en:'Celebrini settles Montreal comeback',es:'',pt:''},
    summary:{en:'San Jose wins 4–3 after overtime.',es:'',pt:''},
    body:{en:'The Sharks erased a two-goal deficit against the Canadiens.',es:'',pt:''},
    sourceName:'NHL',sourceUrl:'https://www.nhl.com/news/san-jose-sharks-montreal-canadiens-game-recap-october-20-2026',sourcePublishedOn:'2026-10-21',
    image:'none',imageCaption:{en:'',es:'',pt:''},featured:false,originalLanguage:'en',
    translationReview:{en:{state:'pending',reviewedAt:null},es:{state:'unavailable',reviewedAt:null},pt:{state:'unavailable',reviewedAt:null}},
  },
];

export const dailyBriefAudit=dailyResearchBriefs.map(draft=>({slug:draft.slug,sourceUrl:draft.sourceUrl,
  originalPublishedOn:draft.sourcePublishedOn,sourceReadOn:'2026-10-21',wordLimit:25,
  reviewStatus:'PENDING_HUMAN_REVIEW',imageStatus:'NO_LICENSED_EVENT_IMAGE',
  dateEvidence:'Original publication date displayed on the official article; event and publication dates are not interchangeable.',
} as const));
