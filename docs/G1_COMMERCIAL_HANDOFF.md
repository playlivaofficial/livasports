# COMMERCIAL HANDOFF — preserved, excluded from the visual release

The original working state remains on the local branch `codex/g1-betsson-br-visual-refresh` in the original LivaSports checkout. The separate `codex/g1-sports-visual-release` branch starts from main at `8c35273729a62923900251d6712e6fb5b4d3955b`. No unfinished commercial code or migration is transferred into that release.

The preservation commit is `e8319b934f7de19db4306b9f785fe75aee530703`. It is local-only and is not an ancestor of the visual release.

This is an inventory and status record, not an activation guide. Commercial activation is not complete.

## Preserved files

- `db/migrations/013_g1_publisher_creatives.sql`
- `src/affiliate/embed-policy.ts`, `embed-document.ts`, `embed.test.ts`
- Unfinished changes in `src/affiliate/analytics.ts`, `configuration.ts`, `operations.ts`, `policy.ts`, `render.ts`, `repository.ts`, `server.ts`, `service.ts`, `tokens.ts`, and `types.ts`
- `src/components/commercial/SponsoredCreative.tsx`, the changed `SponsoredSlot.tsx`, and the corresponding removal of `SponsorCreative.tsx`
- `src/app/api/commercial/creative/route.ts` and changes to `src/app/api/events/route.ts`
- Destination-policy changes in `src/odds/affiliate.ts` and `affiliate.test.ts`
- `scripts/m8-cli.ts`, `scripts/m8-operations-qa.mjs`, `scripts/g1-commercial-qa.ts`, `scripts/g1-publisher-db-qa.ts`, `scripts/g1-portal-browser.mjs`, and `scripts/g1-portal-session.mjs`
- The original G1 draft documents and checkpoint, private portal/configuration captures, and ignored QA evidence

Mixed sports-page changes and the original stylesheet also retain their unfinished commercial placement changes on the preservation branch. The visual release selectively transfers only sports changes.

## Saved configuration

A read-only check on 2026-09-12 UTC found exactly one saved Betsson BR campaign for the owner-confirmed reference **campaign 1 / LivaSports Brazil**. The saved destination matched the private captured destination exactly. Its capability is **SPORTSBOOK**, without a claim of a prefilled selection or slip.

The database currently records three existing CTA placement entries and zero enabled creatives. Migration **013_g1_publisher_creatives.sql is unapplied**. The expanded creative configuration remains private and unapplied.

Existing server-side names are `LIVASPORTS_AFFILIATE_CONFIG_FILE`, `AFFILIATE_SIGNING_SECRET`, `AFFILIATE_ANALYTICS_MODE`, and the database connection variables `DATABASE_URL` / `DATABASE_POSTGRES_URL` / `POSTGRES_URL`. The original checkout retains the ignored files `.env.g1-affiliate-config.json` and `.env.g1-portal-private.json`. No values, destinations, publisher parameters, credentials, or session data are included here.

## Placement inventory

| Preserved placement ID | Identified creative dimensions | Saved state |
|---|---|---|
| home_top_banner | 970×90 | Expanded configuration unapplied |
| home_right_rail | 300×600 | Expanded configuration unapplied |
| match_right_rail | 300×600 | Expanded configuration unapplied |
| team_right_rail | 300×600 | Expanded configuration unapplied |
| player_right_rail | 300×600 | Expanded configuration unapplied |
| mobile_inline | 320×100 | Expanded configuration unapplied |
| profile_mobile_inline | 320×100 | Expanded configuration unapplied |

The sizes describe previously inspected official library metadata. They do not establish successful rendering, production readiness, or activation.

The unfinished publisher integration points are `SponsoredCreative`, `SponsoredSlot`, and the proposed `/api/commercial/creative` endpoint. Existing CTA integration points are `match_odds_table`, `match_slip_comparison`, and `slip_bookmaker_comparison`, through the existing M8 outbound architecture.

## Remaining gaps

The preservation checkpoint records incomplete schema/configuration integration, no verified external isolated publisher rendering, unresolved real-delivery/CSP requirements, incomplete responsive embed and privacy/attribution verification, and draft QA helpers/documents that still describe earlier states. The private expanded configuration has not been promoted to the live database.

The sports visual release does not certify those implementations or supply activation instructions. It preserves the existing GEO, disclosure, age/responsible-gambling, disabled Betano affiliate, and M8 routing behavior by leaving those implementation files unchanged.

## Not deployed

No G1 publisher wrapper, new remote creative source, new banner configuration, migration 013, G1 destination-policy change, embed-click attribution change, commercial API endpoint, or affiliate activation is part of the sports visual release. The saved commercial destination and private groundwork have not been deleted or rolled back.
