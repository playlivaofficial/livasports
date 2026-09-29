import {CLUB_TIERS,COMPETITION_TRAFFIC_TIERS} from '@/growth/config';
import {enabledCompetitionSlugs} from '@/seo/policy';
import {gscProperty} from '@/seo/gsc';

/** Editorial weights are versioned code, never rewritten by the feedback job. */
export const SEO_AUTOPILOT={
  version:'SEO_V2_1',enabled:true,autoPublish:true,primaryGeo:'BR',primaryLocale:'pt-BR',
  tierAThreshold:72,tierBThreshold:52,minUniqueSignals:3,minInternalLinks:2,
  evaluationWindowDays:90,maxNewIndexablePagesPerDay:5,maxAutomaticTitleChangesPerDay:2,
  maxAutomaticContentRefreshesPerDay:10,maxCandidatesPerRun:12,maxInventory:500,
  maxClusterBoost:5,minFeedbackImpressions:100,minFeedbackDays:7,
  dailyRunEnabled:true,weeklyOptimizationEnabled:true,dailySchedule:'10 7 * * *',
  searchConsoleEnabled:true,searchConsoleProperty:gscProperty(),
  enabledCompetitions:enabledCompetitionSlugs(),clubPriorities:CLUB_TIERS,competitionPriorities:COMPETITION_TRAFFIC_TIERS,
} as const;
