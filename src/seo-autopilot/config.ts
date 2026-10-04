import {CORE_GEOS,GEO_PROFILES} from '@/config/geo';
import {APPROVED_COMPETITION_SLUGS,isAcquisitionCompetition} from '@/config/footballCompetitions';
import {gscProperty} from '@/seo/gsc';
import {SEO_OPTIMIZATION} from './optimization-policy';

/** Editorial weights are versioned code, never rewritten by the feedback job. */
export const SEO_AUTOPILOT={
  version:'SEO_V2_2_GEO_GROWTH',enabled:true,autoPublish:true,activeGeos:CORE_GEOS,primaryGeo:'MX',primaryLocale:'es-MX',
  tierAThreshold:72,tierBThreshold:52,minUniqueSignals:3,minInternalLinks:2,
  evaluationWindowDays:90,maxNewIndexablePagesPerDay:5,maxAutomaticTitleChangesPerDay:SEO_OPTIMIZATION.maxAutomaticTitleChangesPerDay,
  maxAutomaticContentRefreshesPerDay:10,maxCandidatesPerRun:12,maxInventory:500,
  maxClusterBoost:5,minFeedbackImpressions:100,minFeedbackDays:7,
  dailyRunEnabled:true,weeklyOptimizationEnabled:true,dailySchedule:'10 7 * * *',
  searchConsoleEnabled:true,searchConsoleProperty:gscProperty(),
  enabledCompetitions:APPROVED_COMPETITION_SLUGS.filter(isAcquisitionCompetition),geoProfiles:GEO_PROFILES,
} as const;
