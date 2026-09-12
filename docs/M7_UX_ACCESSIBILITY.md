# M7 UX and accessibility

M6 remains the compact guest drawer, with persistent canonical intent and explicit replace/clear controls. “Comparar casas” jumps within the inner scroll area; the header and footer stay fixed. Sports content remains primary.

Bookmaker results use semantic section/article headings and stacked cards at 375, 390, 430, 768 and 1440 pixels. Current coverage, combined odds and state are explicit. Best and tied-best states use readable text as well as a restrained border. Incomplete cards show no total; native details are open by default so exact missing fixtures/selections/reasons are visible and keyboard accessible. Long names and large decimal totals wrap without page overflow.

The shortcut transfers keyboard focus to the comparison heading area without moving the outer panel. M6 Escape/focus return, removal focus, keyboard add, explicit replace, ten-selection rejection, cross-tab persistence and touch targets remain. CTAs and summary controls have at least 44px height. A polite status reports only coverage counts rather than every timer tick. Analytics observe visible sections/cards and are best-effort, anonymous and deduplicated.

All product copy is PT-BR or ES-MX. Brand and team names retain their names. Empty, one-selection, no regional bookmaker, partial, stale, suspended, closed, started and failed-read states remain distinct. Quote expiry or an unavailable connection removes totals and links while keeping the selections. A rejected outbound recheck reopens the localized saved slip with an explanation.

The existing product event pipeline handles slip_comparison_view, slip_bookmaker_complete, slip_bookmaker_partial, slip_best_price_view and slip_bookmaker_click. Properties are selection count, locale/GEO, bookmaker, available count, completeness and aggregate market counts. No IP identity, fingerprint, deposit or revenue inference is added.

Local replay screenshots are visibly labeled “SIMULAÇÃO LOCAL · DADOS DE TESTE” or the Spanish equivalent. Their active prices, complete two-book state and enabled test CTA are controlled QA evidence, not a claim of live provider coverage. Real-data route/API checks and database transaction rehearsals are reported separately.
