# P5: three visible bookmakers, four real feeds

Public order is Betsson, Sportingbet BR, betboo BR. Betano BR is an internal insurance source, never a public bookmaker card or affiliate target. The canonical registry is `src/odds/registry.ts`.

For each exact fixture/market/outcome/line: use the target's fresh native REAL quote, otherwise fresh REAL Betano, otherwise the lowest fresh native REAL quote from another visible book (deterministic tie priority), otherwise unavailable. The shared pure resolver is `src/odds/insurance.ts`. Proxies are derived at read time, carry original source/quote/observation/expiry, and are never persisted or used as inputs to another proxy. A returning REAL quote wins immediately. Estimated totals are not awarded the best REAL price badge.

Listing, Match Center and My Slip expose three targets. Visible estimated/source labels accompany proxies, including on touch devices. The slip response boundary rejects duplicate and hidden targets. Exact decimal math and 1/3/5/10-leg comparisons are covered by tests. No ordinary public read invokes a provider.

## Commercial boundary

Existing approved Betsson campaign/destination configuration is preserved. Sportingbet and betboo are NOT_APPLIED and their BR affiliate eligibility is false. Logos remain inert unless the existing server-side campaign, approval, destination and GEO checks issue a signed offer. Migration 029 creates no affiliate URLs or approvals. Owner QA and anonymous GEO behavior remain separate from odds availability.

## Operations

Migration 029 adds the two books and verified BR odds eligibility, and widens two existing bookmaker check constraints. Inserts are conflict-safe; the transaction is rerunnable. No fixture, user, history or existing campaign data is deleted. Four-source owner health reports source versus target coverage and insurance use.

The approved quota policy is documented with measured forecasting in `output/p5-quota-report.md`. Seven-day scheduled-only adaptive priorities, batching, deduplication, shared persisted reads, global backoff and hard request reservations protect the unchanged 5,000-request plan. No live/props calls. Failed provider requests do not replace stored odds with empty data; stored REAL quotes retain their original expiry, then resolve to valid insurance or become unavailable. Expired quotes never become current merely because a provider failed.

## Bounded release acceptance

After the existing production deployment is READY, run `scripts/p5-bounded-backfill.ts --after-ready` with server-side production DB and working provider environment. It takes an exclusive job lease, uses the request governor, caps the run at five total calls, selects at most eight upcoming mapped tournaments, fetches only the two new books, and replays identical snapshots without provider calls to assert idempotency. It stops on the first error. Never automatically rerun it; inspect the sanitized request ledger first. Raw diagnostic artifacts remain ignored.

`scripts/p5-readiness.ts` is a read-only, zero-provider-call integrity/budget/health audit. Initial discovery and source-canary scripts are explicit one-off diagnostics, not scheduler or navigation dependencies. Do not use them for periodic operation.

## Release gates

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run secret:scan`. Browser-check all three locales, light/dark, 320/390/430/desktop, source attribution, 44px odds controls, three slip targets and affiliate gating. Production acceptance must additionally prove deployment SHA, fresh new-source persistence, replay, quota headroom, four-feed health and absence of browser/runtime errors. Never describe cached canary coverage as full live production coverage.
