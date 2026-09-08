export const MATCH_REFRESH_POLICY = {
  upcomingFixtureDiscoveryMinutes: 60,
  prematchDetailMinutes: 30,
  liveSnapshotSeconds: 30,
  standingsMinutes: 30,
  finalReconciliationMinutes: [2, 15, 120] as const,
} as const;

export function estimatedDailySportmonksRequests(input:{concurrentLiveFixtures:number;activePrematchFixtures:number;standingsCompetitions:number;liveHours:number}){
  const live=Math.ceil(input.liveHours*3600/MATCH_REFRESH_POLICY.liveSnapshotSeconds)*input.concurrentLiveFixtures;
  const prematch=Math.ceil(24*60/MATCH_REFRESH_POLICY.prematchDetailMinutes)*input.activePrematchFixtures;
  const standings=Math.ceil(24*60/MATCH_REFRESH_POLICY.standingsMinutes)*input.standingsCompetitions;
  return {live,prematch,standings,total:live+prematch+standings};
}
