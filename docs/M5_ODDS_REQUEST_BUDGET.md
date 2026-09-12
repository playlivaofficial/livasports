# M5 request budget

Paid allowance: **5,000 per subscription month**, not necessarily a calendar month. The audited period is 2026-09-02 11:10:51Z through 2026-10-02 11:10:51Z. Account snapshot reported 50 previously consumed requests; M5 conservatively adds all 11 audit attempts, including account and cooldown failure, rather than assuming whether the provider already counted the account request.

Every controlled live odds attempt is reserved in Neon **before** sending, under a transaction lock. Failed/timeout/retried attempts count. One job has at most four requests by default; configuration cannot exceed six. Normal refresh uses two calls, one singular bookmaker each, batching all due audited tournament IDs. The monthly soft stop is 4,500; the hard limit is capped at 5,000. Unknown/expired account periods fail closed until their new verified baseline is installed. The account must not be independently consumed without reconciling the baseline; the local ledger cannot see another application's key usage.

## Scheduler-ready maximum (not active)

| Category | Monthly ceiling/estimate |
|---|---:|
| Initial account/catalog/fixture verification | 15 reserved; 11 actually used |
| Previously reported account usage | 50 conservative baseline |
| Shared upcoming odds refresh: 2 calls × 4/hour × 16 hours × 31 days | 3,968 maximum |
| Transient retries / verification reserve | 300 |
| Total conservative envelope | **4,333** |
| Remaining before 4,500 safety stop | 167 |

Use 08:00–24:00 America/Sao_Paulo only for the proposed automation. Within 2h: 15-minute shared refresh; within 12h: 30m; within 48h: 120m; farther away: daily. Outside the window or after all canonical fixtures have started: no pregame refresh. No one-query/request-per-user design. In practice these slower tiers consume less than the ceiling.

The 15-minute actionability TTL is deliberately stricter than some far-future refresh tiers. Between observations, a page may honestly show stale/unavailable rather than pretending the quote is continuously current. Higher-frequency 24/7 service would need a different cost decision; none was purchased or activated.

Sportmonks: two narrowly scoped fixture identity/time diagnostics, 50 existing fixtures total. No full M3.6 ingestion and no provider calls for logos, profiles or ordinary navigation.
