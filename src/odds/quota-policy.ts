/** One shared ceiling model for forecast, planner, and transaction-locked request ledger. */
export const NORMAL_FORECAST_FRACTION = 0.75;
export const NORMAL_STOP_FRACTION = 0.80;
export const QUOTA_WARNING_FRACTION = 0.70;
export const QUOTA_PROTECTION_FRACTION = 0.85;
export const CONTROLLED_STOP_FRACTION = 0.90;
export function quotaPressure(used:number,allowance:number){
  const utilization=allowance>0?used/allowance:1;
  return {utilizationPct:Math.round(utilization*1000)/10,
    state:utilization>=CONTROLLED_STOP_FRACTION?'STOPPED':utilization>=QUOTA_PROTECTION_FRACTION?'PROTECTED':utilization>=QUOTA_WARNING_FRACTION?'WARNING':'NORMAL',
    slowdown:utilization>=QUOTA_PROTECTION_FRACTION?4:utilization>=QUOTA_WARNING_FRACTION?1.5:1} as const;
}
