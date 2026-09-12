# M6 — Canonical Slip State Model

## Persisted contract

Storage key: `livasports:guest-slip`; current schema version: **1**.

```ts
type CanonicalSelection = { fixturePublicId: string; scope: 'FULL_TIME_REGULATION' } & (
  | { market: 'MATCH_WINNER'; outcome: 'HOME' | 'DRAW' | 'AWAY'; line: null }
  | { market: 'TOTAL_GOALS'; outcome: 'OVER' | 'UNDER'; line: 2.5 }
  | { market: 'BTTS'; outcome: 'YES' | 'NO'; line: null }
);
type SavedSelection = CanonicalSelection & { addedAt: string };
type StoredSlip = { version: 1; selections: SavedSelection[] };
```

The fixture ID is the existing stable 16-hex public ID, not a provider ID or private database UUID. Identity is fixture + scope + market + outcome + exact line. Bookmaker, price, kickoff, translated labels and team-name spelling are not identity. Rescheduling uses the same public ID.

The stored object contains **no prices, API/database credentials, private IDs, affiliate URLs, translated text or provider timestamps**. The add timestamp is metadata, not a freshness clock.

## Mutations and recovery

The reducer allows add/remove/replace/clear only; ten is the hard limit. Add on the same tuple is a no-op. A conflicting same-fixture add returns REPLACE_REQUIRED. Confirmed replacement includes the expected old key so a concurrent tab's change cannot be silently overwritten. An expired pending odds button cannot be confirmed as fresh.

Restoration bounds input size and inspected entries, validates all canonical combinations, normalizes timestamps and filters unsupported/duplicate entries. Known version 0 migration adds only the explicitly absent full-time scope. Corrupt JSON becomes a safe empty in-memory slip with a notice. An unknown future version is not silently rewritten on initial load; the user can explicitly start a new slip. Unknown market/line/scope is rejected rather than guessed.

Before every mutation, the store rereads current storage. Storage events reread the latest value instead of applying an out-of-order event payload and never echo another write. Completed sequential edits synchronize across tabs; truly simultaneous writers are last-writer-wins. Storage exceptions retain volatile page memory and disclose that persistence is unavailable.

## Resolution and states

POST input is strictly `{locale: 'br'|'mx', selections: CanonicalSelection[]}` with at most ten distinct fixtures and 4,096 streamed body bytes. Query parameters, unknown properties, bad scope/line/outcome, duplicate fixtures and cross-origin browser requests are rejected. There is no arbitrary SQL or provider selector.

| State | Meaning / price behavior |
|---|---|
| CURRENT | Exact current eligible reference, original expiry retained |
| PRICE_CHANGED | Current reference differs numerically from a prior session observation; new price shown |
| STALE | Quote expired, or existing price could not be safely verified online; no price |
| UNAVAILABLE | Missing fixture/selection/verified GEO coverage; intent retained, no price |
| SUSPENDED | Exact market quote suspended; no price |
| CLOSED | Quote closed or fixture cancelled/postponed; no price |
| MATCH_STARTED | Live/halftime or canonical kickoff passed, even if provider status is still scheduled; no pregame price |
| MATCH_FINISHED | Persisted finished state; no pregame price |

During a first unresolved read the interface says it is checking; this is not a saved betting state. On failure, current prices are suppressed and saved intent is retained. A stale selection still advances to started at its known kickoff. Successful future DB reads can recover the same intent to current after a legitimate refresh/reschedule with valid mappings.

Metadata and all pricing re-localize/re-resolve by current route locale. A BR-created tuple in MX remains saved but never borrows BR bookmaker eligibility. Only a real eligible quote can enable the Match Center add control.
