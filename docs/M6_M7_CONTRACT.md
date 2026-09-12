# M6 → M7 Contract (interface preparation only)

The exported `CanonicalSelection`, `SavedSelection`, `StoredSlip`, `ResolvedSelection`, `ReferencePrice`, `SlipResolution` and `selectionKey` in `src/slip/types.ts` are the M6 handoff. No M7 comparison engine or UI is implemented.

M7 may read the same versioned, bookmaker-independent tuples. One fixture appears at most once and the maximum remains ten unless a separately approved version changes it. Line 2.5 and full-time regulation are explicit and must not be broadened silently. A fixture's stable public ID survives schedule/name changes.

For a future bookmaker-specific comparison, the minimum useful result is a bookmaker plus exact canonical tuple/quote pairs, available and missing counts, per-pair state and freshness, and a bookmaker-specific product **only if every required selection has a valid price from that same eligible bookmaker**. This describes a future consumer, not an active product/API promise.

The M6 reference is the best currently observed eligible individual price. References across different selections may come from different bookmakers; **multiplying M6 reference prices cannot establish an available bookmaker slip**. Source bookmaker analytics must never change canonical identity or substitute for future quote lookup.

M7 must independently retain M5 eligibility, exact fixture mapping, freshness, pregame scope, supported markets, kickoff exclusion and affiliate gates. It must report missing selections without substitution, and it must not infer Betsson GEO approval or a transfer destination from a saved M6 selection. Normal user-driven reads must remain DB/cache-only.

M6 stores no account/wallet, placement token, transaction acceptance, combined price, bookmaker transfer link, or affiliate destination. M7/M8 are not started by this contract.
