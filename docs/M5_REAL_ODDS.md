# M5 — Real pregame odds

Football identity remains Sportmonks → canonical Neon records. OddsPapi is an isolated, replaceable odds source. Ordinary page loads, market tabs, the read endpoint and affiliate navigation never call a provider.

## Implemented boundary

- `src/odds/types.ts`: provider-neutral fixture, quote, snapshot and comparison contracts.
- `src/providers/oddspapi/M5OddsPapiAdapter.ts`: authenticated, bounded worker transport. Only two subscribed bookmakers and four audited tournament IDs; singular `bookmaker`, pregame normalization, decimal format.
- `src/providers/oddspapi/m5-normalizer.ts`: strict audited market catalogue; excludes halves, qualification, 2-up, corners, cards, player props and basketball.
- `src/odds/matching.ts`: deterministic contextual identity and persisted mappings, with ambiguity and schedule-change rejection.
- `src/odds/ingestion.ts`: one leased worker, recoverable snapshots, transactional batched upserts and meaningful-change history.
- `src/odds/read-repository.ts`: one indexed query per cold odds read. No history query or provider import.
- `src/odds/runtime.ts`: independent hard-expiring 15-second DB cache. Comparability is recomputed after cache lookup.
- `PregameOdds`: three localized market tabs, exact selection columns, subtle unavailable cells, conservative best-price highlights, active-page expiry and slow visible-only DB revalidation.

## Database

Migration `008_m5_real_odds.sql` extends the existing `odds_current`, `odds_history`, bookmaker GEO and analytics tables. Numeric prices are no longer truncated to four decimal places. Missing provider timestamps remain NULL. Existing legacy rows without verified M5 scope are excluded from reads.

Canonical selection key: fixture + bookmaker + market + outcome + nullable line. Scope is exclusively `FULL_TIME_REGULATION` / `PREGAME`; other scopes cannot enter the M5 tables. This intentionally does not create a second parallel odds schema.

`odds_mapping_reviews`, `odds_sync_jobs`, `odds_sync_snapshots`, `odds_provider_requests`, `odds_provider_catalog` and `odds_budget_baselines` store review, recovery and request-accounting evidence, not a new application identity registry.

## Operational limitations

The paid `betsson` feed resolves to `www.betsson.com`. That is not proof of BR or MX jurisdiction availability. Its real quotes are retained internally, but public BR/MX comparison remains disabled until the exact jurisdiction is verified. Betano BR is restricted to BR. No alternate paid feed was requested.

No affiliate destination is configured, so no outbound CTA is enabled. No 24/7 scheduler exists; prices expire honestly when manual refresh stops. Implementation readiness and automation operation are separate statuses.

M5 does not add a slip builder, betting execution, live odds, player props, price charts or M6/M7/M8 scope.
