# M5 refresh and recovery

`ODDS_INGESTION_IMPLEMENTED`: implemented; controlled live verification is recorded in the release report.

`ODDS_AUTOMATION_OPERATIONAL`: **NO**. No production scheduler was found or activated. A CLI, policy or successful manual run is not 24/7 automation. Nothing depends on the office computer staying on. No hosting purchase/upgrade.

## Separate concerns

- ODDS_DISCOVERY: bounded capability audit; saves audited catalogue and account scope.
- ODDS_MAPPING: deterministic reconciliation against existing canonical records; unresolved evidence goes to review.
- ODDS_REFRESH: shared bounded bookmaker snapshots and batched quote/history persistence.
- ODDS_RECONCILIATION: every refresh revalidates identities, kickoff and status; read-time expiry independently disables pregame.

Commands use the existing server-only environment. Never put a key in a command argument:

```sh
node --require ./scripts/tsx-windows-preload.cjs --import tsx --env-file=.env.production.local --env-file=.env src/odds/cli.ts migrate
node --require ./scripts/tsx-windows-preload.cjs --import tsx --env-file=.env.production.local --env-file=.env src/odds/cli.ts verify
node --require ./scripts/tsx-windows-preload.cjs --import tsx --env-file=.env.production.local --env-file=.env src/odds/cli.ts refresh
node --require ./scripts/tsx-windows-preload.cjs --import tsx --env-file=.env.production.local --env-file=.env src/odds/cli.ts scheduled-refresh
node --require ./scripts/tsx-windows-preload.cjs --import tsx --env-file=.env.production.local --env-file=.env src/odds/cli.ts resume
node --require ./scripts/tsx-windows-preload.cjs --import tsx --env-file=.env.production.local --env-file=.env src/odds/cli.ts replay-latest
```

`refresh` is an explicit bounded manual verification. `scheduled-refresh` applies the budget-aware schedule policy. Both read the verified catalogue/baseline from Neon; no ignored local audit file is needed on another worker. `resume` applies successfully saved but unapplied snapshots without provider calls. It does not invent a response for a bookmaker that failed before retrieval; a subsequent bounded refresh is required for that bookmaker.

Initial `import-audit` is only for saved local evidence, not a recurring command. Replaying it never changes the original provider observation time. Do not re-run the capability audit just to refresh odds.

`replay-latest` is the controlled idempotency gate: replay each bookmaker's newest successful DB snapshot under the normal lease, with zero provider requests. It preserves observation times and should report zero quote/history changes unless a canonical status or kickoff eligibility changed since ingestion (in which case closing prices is required).

## Integrity and failure recovery

One global DB lease prevents duplicate workers; each bounded batch renews its three-minute lease. Expired jobs are marked interrupted, not left silently active. Snapshot persistence precedes quote writes, so a transaction failure is replayable. Quote/history/mapping changes within each snapshot are atomic. HTTP failures preserve all existing bookmaker records. Missing selections in a successful snapshot are closed, not fabricated. Identical price/status observations update metadata only when genuinely newer and do not append price history.

Transient network, 429 and 5xx failures have capped backoff/retry and share the same request ceiling. Authentication/format errors fail without wasteful retries. Errors include status, path and redacted query/body; no sensitive URL or key is printed.

## Freshness and delivery

- `provider_updated_at`: bookmaker change time, else provider `changedAt`; NULL stays NULL.
- `observed_at`: successful upstream response time; cache replay does not replace it.
- `persisted_at`: actual DB write time.
- `last_successful_refresh_at`: successful upstream observation associated with the quote.

Current actionability expires 15 minutes after observation, or at the earlier canonical/provider kickoff. Clock-based evaluation runs after cache lookup and again in the browser. The independent odds cache is 15 seconds, with no stale-on-error extension. New DB snapshots become visible without waiting for slower profile or match-module caches. A visible browser rechecks only the LivaSports read endpoint at most once per minute; hidden pages do not poll. The active page removes expired prices/highlights/CTAs without requiring navigation. Affiliate clicks revalidate uncached DB eligibility.

## Activation requirement

An approved external scheduler/worker must run the bounded command from the deployed source with server-side Neon/OddsPapi credentials, enforce the documented window/cadence, reconcile the account baseline each subscription period, and monitor failures/usage. Current hosting has no such scheduled process. Until then the production UI is a safe snapshot consumer, not an always-fresh odds service.
