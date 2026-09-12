# M6 — UX, Accessibility and Rendered QA

The existing M3.5 dark/green visual system remains authoritative. The slip is a compact utility, never a sponsored banner or a replacement for sports content.

## Interaction and focus

- Native odds buttons have localized accessible names, `aria-pressed`, visible selected styling, hover/focus treatment and a practical minimum 44×44 target. Stale/suspended/closed cells are not selectable controls.
- The launcher exposes count, expanded state and controlled region. The drawer is a named **nonmodal** dialog, so there is no focus trap. Opening focuses close; Escape and close return focus to the launcher. Remove focuses the next available remove control or close.
- Replacement and multi-clear require explicit, keyboard-accessible buttons. The original tuple remains until replacement confirmation. Feedback is compact: the closed launcher subtitle or an inline drawer message, plus one polite status announcement. Price polling does not generate a live-region announcement every second.
- State is written in text, not color alone. No automatic scrolling animation; reduced-motion styles remove transitions/smooth scrolling.

## Layout

Desktop ≥1280px reserves 368px while open, so the panel does not cover Match Center. Closing restores content width. A compact empty panel does not occupy the full screen height. Below this breakpoint, a bounded bottom drawer keeps the header/close and disclaimer visible while its selection body scrolls. Additional page bottom space makes underlying content reachable after scrolling; close remains available. At 375–430px the launcher spans the usable width.

Team/competition text wraps, price chips do not shrink, the tenth remove button is reachable, and disclosures do not collide with action feedback. Existing sponsor placements stay outside the slip. No combined odds or betting CTA appears.

## Localization

PT-BR uses “Meu bilhete”, “Resultado final”, “Total de gols” and “Ambas marcam”. ES-MX uses “Mi boleto”, “cuotas”, “Resultado final” and “Ambos anotan”. Dates are rendered in São Paulo/Mexico City time. Official team names remain unchanged; selection outcomes and competition display names use the current locale.

Terminology was checked against operator-owned examples, not invented English translations: [Betano Brasil help on bet types](https://support.betano.bet.br/hc/pt-br/articles/6413991833629-Quais-s%C3%A3o-os-tipos-de-aposta-dispon%C3%ADveis) and [Betsson México football terminology](https://www.betsson.mx/apuestas-deportivas/futbol/copa-libertadores). These are language references, not affiliate destinations or evidence of feed GEO eligibility.

## Evidence and repeatable QA

`scripts/browser-qa-driver.mjs` launches an isolated headless Chrome profile for this app only. It uses real pointer/keyboard events, checks occlusion, records browser exceptions/network failures/upstream attempts, checks document overflow, and captures unedited PNG screenshots. It never uses the user's browsing profile. The runner closes Chrome and removes only its validated temporary QA profile.

- `scripts/m6-browser-qa.mjs`: real current DB odds, empty/one/three/ten, replacement, eleventh limit, refresh, locale, removal/clear, cross-tab and corrupt storage.
- `scripts/m6-navigation-browser-qa.mjs`: real canonical saved intentions, actual Next navigation through Match Center/team/player, back/forward, locale switch, scrolled tenth control and touch targets.
- `scripts/m6-edge-browser-qa.mjs`: **LOCAL ONLY REPLAY**, visibly labelled in the fixture metadata. Price changes, expiry, kickoff, suspension, closure, finish, missing data, failure/offline recovery and hidden/closed/empty polling. Responses and analytics are intercepted only in the isolated local browser; no test prices or fake fixtures are written to Neon or deployed.
- `scripts/m6-http-qa.ts`: strict resolver security, bounded ten-tuple resolution, GEO/states, sanitized public fields and before/after provider ledger audit.

Rendered viewport matrix: **375, 390, 430, 768 and 1440px**. Local real-price checks passed with no document overflow, broken images, JS exceptions or application 5xx. Refresh/cross-tab/SPA checks use real canonical data, not synthetic price claims. Long wrapped team labels and the last list item were inspected. Unit tests additionally cover two genuinely eligible comparison candidates; the real public account currently provides only one verified bookmaker, so no live two-book sample is claimed.

The reference match page's decoded JS was 505,528 bytes versus 483,915 in the M5.1 recorded baseline: approximately **+21,613 bytes / 4.5%**, with no new runtime dependency. Empty slips make zero resolver reads. Each open-slip cold miss uses one batched query; hot reads may use none. Real one-selection browser CLS was about 0.051 and the three-selection view 0. Repeated viewport/state injection in a local replay is not a field-performance measurement.

See [release report](../output/m6-report.md) for final gates, screenshots and the honest production-versus-replay distinction. No formal screen-reader or WCAG certification is claimed; semantic/static tests and actual keyboard/focus/browser checks were performed.

Production repeated the complete real-odds and SPA matrix successfully. `m6-market-browser-qa.mjs` verifies all three real markets and rapid repeated taps. `m6-natural-boundary-qa.mjs` observed the actual 14:00 UTC cutoff without overriding time: the open slip retained its selection, removed its price and displayed match started. This is real pregame-cutoff evidence, not a claim of an observed live-score feed. `m6-runtime-qa.mjs` captured a bounded, sanitized existing-project log window with healthy MISS/HIT transitions and no unexpected runtime errors.
