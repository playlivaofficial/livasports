# M7 — Full slip comparison

M7 compares the **same canonical guest selections** across eligible bookmakers. It extends M6; add/remove/replace, clear confirmation, version-1 local storage, one pick per fixture and the ten-selection limit remain M6 responsibilities.

Brazil supports Betsson and Betano BR when valid exact quotes exist. M7 adds stacked comparison cards with available/required counts, exact combined decimal odds, accessible missing/invalid selections and price-only best/tie labels. A partial bookmaker never has a combined total. No mixed-bookmaker total, stake, payout, probability or bet placement exists.

The drawer reads `POST /api/slip/compare`; the existing `/api/slip/resolve` remains compatible. Both use LivaSports/Neon only. Normal interactions, refreshes and outbound validation make zero provider calls.

Betsson BR odds eligibility and affiliate approval were confirmed by the owner on September 12, 2026. Its approved destination is not yet available in this local environment. This gates its CTA only. Betano BR comparison is independent of affiliate status; its CTA stays off without real approval and a configured destination. Mexico never inherits Brazil eligibility.

See [engine](M7_COMPARISON_ENGINE.md), [eligibility](M7_BOOKMAKER_ELIGIBILITY.md), [contract](M7_M8_CONTRACT.md) and [UX](M7_UX_ACCESSIBILITY.md). Release/QA evidence and the current deployment status are recorded in `output/m7-report.md` and `output/m7-checkpoint.md`.

## Deployment

Apply additive migration `011_m7_full_slip_comparison.sql` before activating the M7 application. It records confirmed Betsson BR eligibility and adds aggregate analytics fields/events; it preserves MX and does not invent an affiliate link. The migration was integration-tested against real Neon data inside a transaction that rolled back, including idempotent analytics and existing M6 events. No fabricated odds are inserted.

Deploy only the existing `nikapopkha3-4447s-projects/livasports` project, after all gates and a safe synchronized main push. No M8 work, hosting upgrade or new scheduler is included.

Continuous odds automation remains **not operational** on the current Hobby setup. Fifteen-minute quote expiry stays authoritative. A successful local replay or controlled refresh is not continuous automation.
