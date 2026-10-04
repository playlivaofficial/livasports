/** Internal SQL equivalent of public quoteState, for DB-only scheduler/coverage reads. */
export function currentQuoteSql(clock='now()'){
  return `o.status='ACTIVE' AND o.phase='PREGAME' AND o.scope='FULL_TIME_REGULATION'
    AND f.status='SCHEDULED' AND f.kickoff>${clock} AND o.provider_kickoff>${clock}
    AND o.decimal_odds>1 AND o.decimal_odds<=1000 AND o.freshness_ttl_minutes>0
    AND o.provider_updated_at IS NOT NULL AND o.provider_updated_at<=o.observed_at+interval '1 minute'
    AND o.observed_at<=${clock}+interval '1 minute' AND o.last_successful_refresh_at<=${clock}+interval '1 minute'
    AND o.observed_at+(o.freshness_ttl_minutes*interval '1 minute')>${clock}
    AND o.last_successful_refresh_at+(o.freshness_ttl_minutes*interval '1 minute')>${clock}
    AND abs(extract(epoch FROM (f.kickoff-o.provider_kickoff)))<=600`;
}
