# M6 — Guest Bet Slip Builder

M6 adds a local, guest selection planner to the existing Match Center. It does not place a bet, accept money, transfer a slip, or calculate a bookmaker total. No account, new provider subscription, state-management dependency, or scheduled service was introduced.

## User behavior

- BR: **Meu bilhete**; MX: **Mi boleto**.
- Select an eligible real pregame odds button. The native button exposes its selected state and supports keyboard activation.
- Maximum ten selections; one selection per canonical fixture. Another outcome or market on that fixture requires explicit replacement confirmation. Repeated taps do not duplicate it; an eleventh fixture never removes an existing one.
- Remove individual selections; clearing multiple selections requires confirmation.
- Intent survives refresh, page/SPA navigation, back/forward, locale switches and browser-tab changes. No saved quote is considered current.
- The nonmodal desktop panel reserves space at 1280px and above. Smaller screens use a bounded bottom drawer with scrollable contents and a permanently reachable close control. Existing pages/sponsor slots remain intact.
- The visible disclaimer states that no bet was placed. Local storage is described as browser-only and registration-free.

## Integration

`src/slip/types.ts`, `state.ts` and `client.ts` define a small external React store, not a global client-rendered application. The root server layout renders `SlipShell` as a Suspense-contained client island. Match Center's existing client odds table supplies canonical intent only. See [state model](M6_SLIP_STATE_MODEL.md).

`POST /api/slip/resolve` accepts at most ten unique fixtures and a locale. Its shared M5 read repository queries existing canonical fixtures/teams/competitions and current odds in one parameterized query for all cache misses. An indexed public-ID selector replaces no existing M5 selector or provider adapter. The maximum SQL result is 500 rows; the approved two-book/three-market scope is well below that bound.

Server caching is a bounded 256-entry, 15-second hard-TTL in-process cache keyed by fixture public ID and locale. Empty/missing results can be cached, but exceptions cannot serve a stale price. Every response recomputes quote eligibility/expiry using the current clock. Responses are private/no-store/noindex; no personalized slip is placed in a shared HTTP cache. No user action calls OddsPapi or Sportmonks.

## Price truth

The displayed price is the highest valid current reference returned under **unchanged M5 exact-mapping, full-time, pregame and GEO rules**. It is named by bookmaker. “Best” appears only if M5 establishes at least two eligible comparable prices; a sole Betano quote has no best label. There is no combined product or implied bookmaker acceptance.

Prices expire on the original M5 15-minute deadline, never 15 minutes after opening a slip. The browser independently removes expired/offline/post-kickoff prices. A session-memory observation can identify a changed price; after a full browser reload, the first newly resolved price is current rather than inventing a prior observation. Persisted intent remains unchanged through expiry, closure, disappearance, kickoff, finish and rescheduling.

The open, visible, nonempty, online drawer reads LivaSports at a restrained 60-second cadence; foreground/online events are debounced for 15 seconds. Closing/unmounting aborts reads and removes timers. There is no polling for hidden/offline/empty/closed slips. A one-second local clock guard does not perform network requests. Server resolved time plus a monotonic browser clock prevent an initially slow device clock extending known expiry.

## Analytics / migration

Optional best-effort events reuse `/api/events`: `slip_open`, `slip_selection_add`, `slip_selection_replace`, `slip_selection_remove`, `slip_clear`, `slip_state_invalidated`. There is no full-slip analytics upload, fingerprint, account identifier, or affiliate conversion claim. Payloads carry one canonical tuple/locale and optionally the source bookmaker as context, never as saved identity. Local de-duplication, UUID idempotency and bounded server event rates apply. UI actions never await analytics success.

Migration `010_m6_slip_events.sql` adds allowed events/outcome/line and permits null fixture context only for aggregate open/clear events. Existing event-context requirements remain enforced. It does not modify fixture, odds, profile or ingestion tables. The migration ledger makes repeat application a no-op; no destructive migration is necessary to roll back application code.

## Operational limits

- Continuous odds automation remains **NOT operational** on the current Hobby setup. A controlled refresh is not automation. Expired odds disappear even if this leaves no selectable price.
- Betano BR remains eligible for BR only. Generic Betsson remains GEO-unverified for BR/MX. M6 does not activate either bookmaker's affiliate CTA or invent a destination.
- Database failures preserve intent without a current reference price. Browser storage denial falls back to page memory with an explicit warning. Simultaneous cross-tab writes are last-writer-wins; ordinary sequential edits reread and synchronize storage.
- Guest intent is not synchronized across devices and is lost if browser site data is deleted. No local storage encryption/security claim is made.
- No M7 bookmaker-by-bookmaker slip engine, M7 UI, or M8 activation was implemented.

Release evidence and exact request accounting: [M6 report](../output/m6-report.md). Accessibility/rendered QA: [UX documentation](M6_UX_ACCESSIBILITY.md).
