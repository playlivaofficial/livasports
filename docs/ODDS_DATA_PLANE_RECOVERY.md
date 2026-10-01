# Odds data-plane recovery (P0, 2026-10-01)

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
