# M5.1 — Betsson GEO verification

Result at 2026-09-12: **GENERIC_UNVERIFIED for BR and MX**. Affiliate approval is recognized but does not change pricing jurisdiction.

## Evidence actually available

1. Reused the same-day M5 authenticated `/v4/bookmakers` response (10:39:50 UTC) rather than paying for a duplicate lookup. Entries identify `betano.bet.br` as Betano BR and `betsson` as Betsson, without BR/MX jurisdiction fields. Generic metadata's live-capability flag describes provider coverage, not this account's disabled live access.
2. Persisted real Betsson quote sources are `www.betsson.com`. Betano's sources are `www.betano.bet.br`. No BR/MX feed-equivalence assurance is present in these records.
3. Current [OddsPapi bookmaker documentation](https://oddspapi.io/us/docs/get-bookmakers) does not certify jurisdiction-specific price equivalence for the generic Betsson slug.
4. Official [Betsson affiliate terms](https://www.betssongroupaffiliates.com/br/termos-e-condicoes/) distinguish the Brazilian `betsson.bet.br` promotion terms and list `betsson.mx` separately among group sites. This is evidence of distinct operator destinations, **not** evidence that generic OddsPapi prices equal either local offering.
5. No provider support response or approved campaign material proving feed/GEO equivalence is available in the project evidence. No support message was sent on the user's behalf.

No legal eligibility is inferred from fixture country, brand recognition, a URL alone or affiliate approval. MX competition fixtures in a BR bookmaker feed can be pricing for BR users, not Mexican bookmaker access.

## Enforced states

`VERIFIED_BR`, `VERIFIED_MX`, `VERIFIED_BR_MX`, `GENERIC_UNVERIFIED`, `NOT_ELIGIBLE` are durable GEO states. Reads require enabled bookmaker/GEO flags, verified metadata, the correct state and a compatible source domain. Tests deliberately set mistaken DB flags and confirm generic Betsson still stays gated. Betano BR cannot become MX-eligible under any state.

The implementation allows verified local Betsson `.bet.br`/`.mx` sources only; neither is fabricated. If explicit provider evidence later certifies a generic source for a local jurisdiction, record that evidence and review the source-domain rule separately before activation. Do not simply flip a flag to bypass it.

Remaining evidence needed: provider confirmation of the exact paid feed's jurisdiction and market equivalence, or an actual local feed under the existing approved subscription, plus the intended affiliate campaign's GEO. No additional paid bookmaker is recommended or purchased.
