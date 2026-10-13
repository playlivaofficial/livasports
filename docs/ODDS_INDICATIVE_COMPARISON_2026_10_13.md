# Genuine odds and separate −10% indicative comparison

## Scope and safety boundary

Candidate based on production `64de82d33d1067097b49c355fcfd3bb9dcee79e4`. This release adds a separate, non-executable calculation channel. It does not write invented quotes into `odds_current`, change provider entitlements, extend freshness, or change the scheduler, quota model, signed selection identity, commercial eligibility or affiliate destinations.

The ordered local pairs are Mexico Betsson → Winpot MX, Colombia Betsson → bwin, and Peru Inkabet → 1xBet. For each exact canonical fixture/market/outcome/line, a missing second-bookmaker genuine price can have an indicative factor equal to the first bookmaker's fresh REAL price × 0.90. Genuine target prices always win. There is no reverse calculation, cross-GEO substitution, estimate chaining or invention when both sources are missing. Supported pregame markets remain 1X2, OU2.5 and BTTS, full-time regulation.

`CalculatedOddsEstimate` has explicit source, target, original price, observation and expiry plus `executable:false` and `affiliateEligible:false`. It never becomes an `OddsCell` or signed selection candidate. Internal source quote IDs are stripped from public responses; accessible attribution retains bookmaker, source price and timestamp. Source expiry/kickoff also expires the calculation. Decimal multiplication is exact; display rounding uses the existing half-up two-decimal convention. A source below 1.111… may produce a mathematical factor below 1: it is labeled as such, never clamped into fictitious valid bookmaker odds and never selectable.

## UI and slip behavior

Listing boards, Match Center and My Slip show `≈` for comparison prices. REAL values are separately marked Real. Calculations carry the visible localized disclaimer “Estimación −10% · No es una cuota ofrecida por esta casa” and source attribution. They are not buttons and cannot produce a price-dependent affiliate CTA. Existing independently approved bookmaker-logo links remain separate.

Actual availability/counts, complete-bookmaker accumulators and achievable-price potential returns remain based on genuine prices only. Missing target prices do not delete canonical slip selections. Indicative combined factors/returns are separate fields, clearly marked non-executable. An expired or withdrawn selected signed quote still suspends the affected selection and requires explicit confirmation of a current alternative; no bookmaker, outcome or price is silently replaced. Invalid selected identity disables dependent comparisons, not unrelated fixtures.

The narrow-screen sponsor grid now shrinks to its container at 320px. Approved creatives, tracking and destinations are unchanged. Operator logos retain the existing fixed 80×44 wrapper and 80×26 contained artwork.

## Native versus calculated coverage

Read-only capture: **2026-10-13 11:37:22 UTC**. Same controlled 308 upcoming fixtures across 23 approved acquisition competitions as the preceding incident. Counts below mean complete market coverage. `real → comparison` includes genuine quotes plus separately labeled calculations, not new bookmaker availability.

| GEO / bookmaker | 1X2 | OU2.5 | BTTS |
|---|---:|---:|---:|
| MX Betsson | 174 → 174 | 175 → 175 | 177 → 177 |
| MX Winpot MX | 131 → 214 | 95 → 207 | 118 → 211 |
| CO Betsson | 174 → 174 | 175 → 175 | 177 → 177 |
| CO bwin | 178 → 203 | 178 → 203 | 178 → 203 |
| PE Inkabet | 167 → 167 | 168 → 168 | 170 → 170 |
| PE 1xBet | 102 → 195 | 93 → 186 | 90 → 185 |

Across these GEO-specific rows: **6,367 genuine outcomes**, **1,489 calculated outcomes**, **zero formula/source/eligibility violations**. Betsson's MX/CO appearances reuse one upstream feed; they are not separate provider calls. Thirty-eight historical enabled fixtures outside the approved acquisition set remain reported separately, not silently re-enabled. The rolling 168-hour cohort differs from a seven-calendar-day board at its date boundary. Coverage will change as fixtures start and observations expire.

Current data mostly has entire missing markets; exact partial-outcome fallback, recovery and genuine-over-estimate priority are additionally verified in regression tests. The report does not claim every one of the 308 fixtures was manually clicked.

## Quota and upstream evidence

At 11:34 UTC the current subscription period was October 2–November 2 with a 5,000 hard limit. The last successfully verified provider account report was **683 used** at 00:25 UTC. Conservative local accounting was **739** (731 counted requests plus an external floor of 8), leaving 4,261 below the provider limit, 4,011 below the internal safety cap and 3,911 below the routine cap. Failed/unknown attempts are deliberately not reclaimed.

One new unmetered `GET /v4/account` request at 11:24 UTC returned **HTTP 500**. No retry was made. Task provider traffic: **1 network request, 0 billable odds requests**. Thus 739 is conservative accounting, not a freshly confirmed live provider dashboard total; the owner's approximately 500 figure is stale.

Rolling-day usage was 144, UTC-day 56, paced cap 195, routine stop 156 and controlled stop 175. Routine headroom was 12; controlled reserve 31. The current seven-day plan projected 447 requests (64/day average, 87 peak), comfortably below the routine target. The prior release already corrected repeated empty FA Cup requests and shared mapping/replay defects. This audit found no fresh saved upstream outcomes lost by the current read model. Removing quota protection would not fix an upstream 500 and could recreate wasted traffic, so this release does not weaken it.

Suspended markets, expired observations, omissions and excluded markets remain real upstream gaps. Existing genuine odds survive temporary provider failure only until their defined expiry; neither calculations nor failure metadata renew freshness. The native-coverage incident remains externally limited until a successful current upstream response can prove further coverage. It is not declared resolved by this comparison feature.

## Verification and reproduction

- Full final local suite: **2,823 PASS** (2,806 Vitest across 278 files, 17 validation tests). Typecheck, lint, production build, diff check and secret scan PASS. The environment-free local build retains the pre-existing metadataBase fallback warning; production configuration is unchanged.
- Bounded local HTTP canary: 30 real fixtures across MX/CO/PE and 1X2/OU2.5/BTTS. Genuine admission HTTP 200; calculated admission HTTP 409. All 12 one/three/five/ten-leg comparisons preserved selections, kept target actual totals null and CTAs incomplete, and supplied separate indicative totals. All 42 checks report providerRequests=0.
- Actual rendered local QA: MX/CO/PE boards at 320/390/430/1440, zero horizontal overflow and no selectable calculated cells. Genuine Colombia selection persisted and displayed distinct real/indicative returns with no estimate CTA. Peru Match Center's three market tabs and narrow-screen layout verified. Sponsor creatives and logo dimensions preserved.
- Direct API, expiry, offline, suspended/withdrawn source, both-missing, wrong-GEO, non-reversal, precision and partial-outcome recovery regressions are included. Existing quote-signing and affiliate eligibility tests pass unchanged.

For read-only coverage, use the existing private server-side environment with `node --import tsx scripts/odds-estimate-audit.ts`. The script has no provider/write entry point and emits ignored private detailed evidence. Never commit environment files, credentials, signed receipts or private payloads. Hosted CI, preview and production acceptance are recorded on the release PR and final handoff; no production success is implied by this pre-release audit.
