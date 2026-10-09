# Odds data-plane recovery (P0, 2026-10-01)

## Strict selection locking addendum — 2026-10-09

The sections below describe the historical October 1 deployment. The current authoritative baseline is `a282e36a036eac6e4c71df8181bdc6237920f287`; its verified commercial jurisdictions are MX, CO and PE. Do not restore retired BR feed/affiliate behavior from historical documentation.

- All enabled, legally/technically verified local provider rows are evaluated before an outcome is unavailable. Currently MX has Betsson; CO has Betsson/bwin; PE has Inkabet/1xBet. Foreign reference quotes remain attributed information, never executable selections. No provider is called during navigation or selection.
- `/api/slip/select` is the only runtime admission path. Same-origin, bounded, rate-limited requests supply canonical intent, selected bookmaker and expected price. A fresh DB read must find an ACTIVE, genuinely REAL, mapped, unexpired local quote on a scheduled future fixture. Missing signing configuration fails closed.
- The admission receipt uses domain-separated HMAC with the existing server-only affiliate signing key. It binds canonical fixture/market/outcome/line/scope, GEO, bookmaker, provider, underlying quote ID, accepted price, observation and frozen expiry. No owner authentication secret is reused. The receipt contains no secret key.
- Comparisons, resolution and both affiliate redirect boundaries revalidate that exact binding against persisted truth. Bound reads bypass the short navigation cache. Reprice, withdrawal, suspension, expiry, kickoff, missing mapping or GEO mismatch suspend the leg; comparison totals and dependent CTAs become unavailable. Other fixtures remain selectable.
- A fresh alternative is only a proposal. Explicit confirmation invokes admission again; never silently substitutes book, outcome or price, and never extends an old receipt's expiry. Existing legacy slip data is preserved but requires explicit fresh-price acceptance.
- Async admission deduplicates per-market clicks and uses per-market revisions plus clear/remove compare-and-swap protection. Late responses cannot resurrect cleared/removed/replaced selections. Exact expiry is checked after the DB read and on the client before persistence.
- Unpriced selection controls are removed. Native REAL comparison totals are not marked approximate; informational references remain visibly non-executable. Temporary QA diagnostics are not shipped.

Reviewed saved-response aliases fix Al Ahli Saudi, Cúcuta Deportivo FC and Internacional FC de Palmira only in their exact competition. Both roles, competition and UTC kickoff must still agree uniquely. The latter canonical fixture is POSTPONED and remains non-selectable despite provider prices. No kickoff tolerance, freshness lifetime, quota/cadence, provider plan, owner auth or affiliate eligibility is weakened.

Owner refresh health now uses persisted paced due/stale-after deadlines rather than a second unscaled refresh allowance. Expired quotes, failed mappings, provider errors and genuine overdue deadlines remain unhealthy. Saved response replay preserves original observation timestamps; its second persistence pass must write zero additional history/current rows.

Final acceptance exposed a worker-admission contention hazard: the advisory lock could block a scheduler request until the 180-second hosting deadline. Admission now uses `pg_try_advisory_xact_lock`; a busy/unconfirmed lock immediately raises the existing `ODDS_WORKER_ALREADY_RUNNING` result without changing job records or spending provider requests. Normal stale-lease expiry and duplicate-job checks remain inside the acquired transaction. The existing scheduler boundary returns 409 for overlap and the GitHub fallback ticker already treats it as healthy deduplication. No quota/cadence or price-expiry rule changes. Do not hold the production worker lock for a long QA rehearsal; use mocked contention tests and short, explicitly rolled-back checks instead.

## Contract

An HTTP 200 or completed cron is not proof of usable native odds. Control-plane execution and public native data health are separate. Public books are Betsson, Sportingbet BR and 1xBet; Betano is hidden insurance and never satisfies a public-native SLO. Ordinary navigation remains DB/cache-only, with zero provider calls.

Migration `055_odds_data_plane.sql` is additive/idempotent. It adds target queue/evidence timestamps and catalog reconciliation metadata without changing quotes, subscriptions, fixture IDs, budgets or existing observations.

## Refresh lifecycle

The existing global worker lease encloses a durable per-bookmaker/tournament queue. Each tick reconciles WAITING/PENDING/BACKOFF/BLOCKED targets; atomic claims require every requested target and hold a three-minute job-owned lease. Expired leases can be reclaimed. Pending age survives ordinary re-planning and outranks new urgency after one five-minute tick, both within and across feeds. Successful persistence clears the lease. Permanent mapping/schema failures remain visible and blocked from wasteful requests; saved-response identity recovery remains available without provider calls.

Each batch member receives its own outcome: NATIVE_PERSISTED, VALID_EMPTY, PROVIDER_EMPTY, MAPPING_EMPTY or PARSER_EMPTY. HTTP failures separately retain target-not-found, rate, auth and transient classifications. Suspended/withdrawn/closed prices are legitimate empty native availability, not active prices. Unmatched payloads and empty expected targets cannot advance verified success. Writes to legacy and supplier-isolated odds tables are asserted in the same transaction; a mismatch rolls back before success/applied timestamps. Prices outside the seven-day supplier write horizon are OUT_OF_SCOPE, not a false persistence failure.

Empty or invalid parsed payloads do not close still-valid saved quotes. Explicit suspension/withdrawal still does; existing frozen expiry and kickoff closure remain authoritative. An old replay cannot regress timestamps or overwrite newer quotes.

## Freshness and budget

Unchanged requested pregame cadence: <=2h:30m; 2–24h:120m; 1–3d:360m; 3–7d:720m; beyond seven days/completed: no refresh. Existing quota forecast scaling stretches these intervals, rounded to five-minute ticks. A quote's lifetime is frozen at observation (scaled interval plus five minutes), never retroactively shortened as kickoff approaches. Target stale-after is its normal due time plus one five-minute scheduler tick. Rescue continues before native expiry. Overdue targets remain visible, including budget deferrals; a provider outcome never converts missing native coverage to green.

The existing 75% forecast target, 80% automatic stop, 90% controlled stop and monthly reserves are unchanged. An explicit shared 72 billable requests/rolling-hour ceiling also covers controlled diagnostics (equal to the existing six-per-tick × twelve ticks envelope). 404s use target-specific bounded rechecks rather than the unrelated six-hour duplicate-4xx guard. Auth/other 4xx are not blindly retried. 5xx/network backoff remains exponential with deterministic jitter and circuit protection. No immediate automatic retry loop.

Competitions outside the seven-day window remain in the complete 34×4 owner matrix but do not produce a false refresh-overdue incident. The existing native-selection minimum/SLO policy remains; no arbitrary 100% provider coverage promise is introduced.

## Catalog

Only reviewed exact slug/category matches auto-resolve. `Paulista, Serie A1` / `paulista-serie-a1` deterministically maps to Paulista A1 (catalog ID 372). No fuzzy team or Saudi playoff mapping is introduced. Catalog rows store raw/normalized identities, candidates, confidence/reason, first/last source observation, occurrence count and reconciliation time. Re-evaluating an unchanged cached source does not inflate occurrence count. Six unrelated Saudi identities remain unresolved rather than guessed into the playoff competition.

## Release/verification

Run frozen install, lint, typecheck, full tests, production build, secret scan, transactional migration-twice and real saved-payload replay-twice rehearsal, desktop/mobile owner QA, hosted CI and preview. Apply migration through `runMigrations`; merge the reviewed PR and use only the existing Vercel project. Observe automatic production ticks across a due boundary, inspect outcomes/leases, compare DB/native API/UI, and account all diagnostic requests. Do not claim permanent recovery from a single green cycle. Detailed baseline and acceptance evidence is in `output/p0-odds-reliability-report.md` and its JSON evidence companion.
