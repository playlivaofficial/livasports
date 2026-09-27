# Revenue readiness sprint

## Conversion contract

Discovery / match / competition → current canonical pregame selection → My Slip →
the same fixture, market, outcome, line and scope at each eligible operator → signed,
revalidated affiliate redirect. No automatic bet placement or transferred betslip is claimed.
Missing, expired, suspended and started-fixture prices remain unavailable. Provider budgets,
backoff, deduplication, cadence, insurance, ranking and GEO architecture are unchanged.

## Verified production baseline

- Production and authoritative main: `616bcb4e1b10eeeecb2a7adba1ae57fd7fec8f2e`.
- Public comparison: Betsson, Sportingbet, 1xBet. Approved affiliate campaigns: Betsson and 1xBet only.
- Sportingbet is comparison-only until an approved destination/campaign is configured.
- Betano is hidden insurance, with affiliate access disabled. Betboo is disabled and absent from
  refresh targets; historical quote rows are retained, not used as active demand.
- No operational postbacks or verified conversion/revenue records.
- Partner redirects preserve configured tracking. From Georgia, Betsson routes to its Georgia
  site; 1xBet redirects to its BR domain and applies a country block. These are not proof of a
  Brazil-origin operator landing experience.

## First-party attribution

The click ledger remains authoritative. The one matching server analytics outcome uses the same
UUID and is emitted only after a successful, deduplicated ledger insert. A redirect is
`outbound_redirect_completed`; an approved publisher embed activation is
`affiliate_embed_activated`, not a claimed redirect. Client `affiliate_cta_clicked` remains an
interaction, never an additional conversion. Owner/QA traffic is excluded from human reporting.

Raw placement is preserved. Additional dimensions are deterministic:

| Dimension | Values / purpose |
| --- | --- |
| `revenueSurface` | `livasports_odds`, `livasports_same_slip_compare`, `livasports_banner`, `livasports_competition` for actual commercial placements |
| `revenueJourney` | `livasports_match`, `livasports_slip`, `livasports_competition` when supported by context |
| `revenueAcquisition` | `livasports_social` only when the identity-matched first-party session proves social acquisition |
| Reserved placement labels | `livasports_sticky` and `livasports_slip` support corresponding future direct commercial placements; the current sticky control opens My Slip and does not itself redirect |
| Context | Operator, approved internal campaign UUID, locale, canonical page, verified fixture/competition, market/leg count, selected fixture/market set, coarse device class |

The server joins the matching session **and** anonymous identity for frozen acquisition/UTM data.
An internal referrer without a known session is not invented as direct acquisition. No user agent,
IP, email or private partner identifiers are stored in the new dimensions. Partner URLs are not
rewritten: no network subID specification is assumed. Manual social content retains its existing
fixture-specific tracked landing URL; canonical URLs remain query-independent for tracking.

## Private configuration hygiene

Private partner identifiers were removed from the current migration/test source. Migration 043
is already recorded in production; its sanitized historical marker does not alter live rows.
Fresh databases must receive approved campaigns through private server-side configuration, never
through embedded production or synthetic affiliate destinations. Migration 045 now leaves the
existing Betsson placement intact when no approved 1xBet campaign exists. No production migration
or campaign change is required by this sprint. Existing Git history is not rewritten.

## Verification record (release candidate)

- Production browser: 1/3/5 canonical selections, exact same-slip cards, removal/recalculation,
  persistence after reload, incompatible outcome replacement without increasing leg count.
- Browser widths 320/390/430/1440 inspected; no observed horizontal clipping in conversion UI.
- Georgia: no affiliate links/banners; owner Brazil QA preview: approved offers visible,
  Sportingbet link clearly unavailable, hidden operators absent.
- Controlled signed QA redirects reached both configured operators; each ledger row reconciled
  with exactly one server event. No registration, deposit or bet was performed.
- Read-only production-schema EXPLAIN validates the changed analytics INSERT; no test data written.
- All owner reporting queries also execute successfully in a read-only production transaction.
  The funnel is now a nested session cohort (not a chronological sequence), fixing the observed
  112.5% independent-stage ratio. Overall banner/direct and restored-slip conversions remain in
  overall metrics even when they do not qualify for every funnel stage.
- Twenty money-page HTTP checks passed: discovery/today, four competitions, five Brazilian
  pregame match pages and eight covered/finished/no-odds examples. Canonical/hreflang remained
  intact, and the non-eligible response contained no public affiliate links or hidden operators.
- Focused affiliate/analytics/owner tests: 232 pass. Build, lint, typecheck and secret scan pass.
- Full Windows baseline reproduces the pre-existing five-second scheduler simulation timeout:
  baseline 1540 pass / 1 timeout; final candidate 1547 pass / same timeout. Scheduler source/test
  blobs are identical. No timeout or assertion was weakened. Linux CI is required before merge.

Release and final production evidence must be appended after CI, Preview and deployment checks.
