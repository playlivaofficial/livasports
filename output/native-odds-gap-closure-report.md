# LivaSports — Native Odds Backoff & Provider-Gap Closure

Status: **PASS — RELEASED AND PRODUCTION-ACCEPTED**

Evidence timestamp: 2026-09-21 12:50 UTC. All coverage figures are point-in-time database observations over 58 upcoming eligible fixtures; they are not permanent coverage guarantees.

## A. TARGET_BACKOFF

- Before: 210 selections classified only as `TARGET_BACKOFF` / `QUOTA_OR_BACKOFF_DELAY`.
- Exact audit: all 210 were Copa del Rey tournament 329, split 70 selections/10 fixtures for each of Betsson, Sportingbet BR and betboo BR.
- Provider evidence: each target had no prior success; its latest isolated OddsPapi request returned HTTP 404.
- After: generic `TARGET_BACKOFF` = 0 and `QUOTA_OR_BACKOFF_DELAY` = 0.
- Exact remaining subreason: `HTTP_404_TARGET_NOT_FOUND` = 210, now classified as external `PROVIDER_GAP` with next eligible recheck.
- Before delay snapshot: average 492 minutes, median 517.
- After delay snapshot: average 475 minutes, median 500 (elapsed time; no hard-error bypass).
- Recovered into native due to optimization: 0. There were no native prices in this cohort and no active transient backoff cohort to recover.
- Fallback reduced specifically by this change: 0 at audit time.
- Additional normal provider requests/day: 0. Transient recovery may add only bounded failure-event retries under the unchanged quota caps.
- No retry storm: hard 404/auth/rate-limit/circuit state cannot enter early; transient re-entry has 0–4 minute deterministic jitter and scheduler batching.

This is not merely a new label: saved request evidence proves the 210 are a target-local external 404 cohort. Healthy tournaments/bookmakers are no longer represented as sharing a generic delay.

## B. PROVIDER GAP

- Original verified feed gaps: 376 selections.
- Newly proven hard-target gap: 210 selections.
- Current total `PROVIDER_GAP`: 586.
- Pipeline defects, identity unresolved, mapping failures, stale/expired and unknown pipeline defects in the current cohort: all 0.
- Suspended/removed selections: 22, kept separate from provider gaps.
- Additional native OddsPapi coverage discovered: 0. Saved market catalog contains only canonical IDs 101/104/1010; no semantically valid alternate ID exists. Existing requests use full verbosity, no market filter and tournament batching.

Largest original cohorts include Sportingbet Série B/La Liga 2/Liga MX 1X2 and Betsson MLS/Série B/La Liga 2/Liga MX BTTS. Stored diagnostics show returned market evidence where present and explicit provider-gap/suspension evidence where absent; no price is fabricated.

### Current fixture-level coverage

| Bookmaker | Any native | Complete 1X2 | Complete OU2.5 | Complete BTTS | Fixtures with any fallback | Unavailable fixtures |
|---|---:|---:|---:|---:|---:|---:|
| Betsson | 44/58 (75.86%) | 44 | 44 | 3 | 37 | 18 |
| Sportingbet BR | 28/58 (48.28%) | 16 | 28 | 28 | 28 | 18 |
| betboo BR | 32/58 (55.17%) | 32 | 32 | 32 | 12 | 18 |

Fallback measures overlap native because a fixture can have native 1X2 and fallback BTTS. Public UI and fallback hierarchy are unchanged.

## Multi-source readiness

- Migration 033 stores each supplier independently from canonical bookmaker identity.
- Future adapters must supply verified fixture/bookmaker/market mappings, freshness, confidence and provenance.
- Resolution chooses one complete/source-consistent supplier snapshot; partial 1X2 prices from different suppliers are never mixed.
- Supplier conflicts resolve deterministically by completeness, selection count, freshness and configured priority.
- Internal health is available per supplier/bookmaker; public provider branding remains absent.
- Enabled suppliers: OddsPapi only. No second provider, fake quote, subscription or billing change.
- Public response hardening strips supplier identity, source quote IDs and source observation timestamps at the browser boundary while preserving complete server-side provenance and owner-health evidence.

Candidates: Sportingbet BR first-party API for Sportingbet (legal/API-key approval required); SportsGameOdds for a Betsson-only coverage trial (Sportingbet/betboo not publicly listed); Sportradar OC Core for enterprise evaluation (exact BR books not publicly proven). Details and official URLs are in `docs/NATIVE_ODDS_GAP_CLOSURE.md`.

## Quota and integrity snapshot

- Audit provider requests: 0.
- Rolling 24h: 147/275 (53.5%).
- Current UTC day: 60; projected end of day: 113.
- Period usage: 1,635; conservative remaining: 3,115; routine remaining: 3,015.
- Scheduler simulation: 113/day average, 180 peak, scale 1.95.
- Average reserve: 58.9%; peak reserve: 34.5%.
- Due batches at audit instant: 0.
- DB before release: 34 enabled competitions, 43,397 fixtures, 2,388 teams, 47,009 mappings, 6,465 current quotes, 30,551 history rows, zero duplicates/invalid/orphans/running jobs/unapplied snapshots.

## Release gates

- Targeted public-boundary tests: PASS (26/26).
- Full tests: PASS (1,218 total: 1,201 Vitest + 17 Node).
- Typecheck: PASS.
- Lint: PASS.
- Production build: PASS (Next.js 16.3.4, 51 static generations completed).
- Secret scan: PASS (0 environment-file, credential-value, client-reference, remote or path violations).
- Migration idempotency: PASS; second run applied zero migrations.
- DB integrity: PASS; zero duplicate, invalid, orphan or unapplied odds rows and zero running jobs.
- Released code SHA: `ce4dca3284d29e48e2afec0ed467ee2114ad6a21`.
- Production deployment: `dpl_D3SqXFqMVKZgCYWNQR3r7Bsmax4r` — `READY` and current for `livasports.com`.
- Production health: `HEALTHY`; 0 critical, 0 degraded, 6 healthy; next 24h 5/5 and next 3d 6/6 priced.
- Production telemetry: generic `TARGET_BACKOFF` absent; exact `HTTP_404_TARGET_NOT_FOUND` = 210; all four source identities are visible internally under `ODDSPAPI`.
- Public acceptance: three bookmaker cards and three market comparisons returned; Betano and supplier/source identifiers were absent from public odds and slip payloads.
- Normal public navigation/API acceptance provider requests: 0. No manual upstream request was issued for release acceptance.
- Apex and HTTPS: PASS; `www.livasports.com` redirects to the apex.
