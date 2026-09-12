# M8 campaigns and secure setup

Betsson BR odds eligibility and affiliate approval remain confirmed. Its approved destination is **not available in this local environment**. Betano BR remains eligible for odds, with affiliate CTA off. Mexico eligibility and commercial configuration are independent. No operator destination, campaign ID, tracking ID or creative has been invented or seeded.

M8 reuses `affiliate_links.destination_url` for the server-only destination, `affiliate_clicks` for click evidence and `profile_sponsor_campaigns` for approved creatives. `affiliate_campaigns` adds operator campaign identity, destination type, approval reference, dates, placement and domain allowlists. One destination/current campaign per bookmaker/country is supported; configuring a new campaign retires other identities on that destination. Ambiguous direct database configuration fails closed.

To configure existing approved material securely, create a private JSON file outside the repository, restrict its filesystem access, and set **`LIVASPORTS_AFFILIATE_CONFIG_FILE`** to its absolute path in the operator's environment. The exact destination input key is **`destinationUrl`**, stored in **`affiliate_links.destination_url`**. Do not paste this file or tracked URL into chat, reports or Git. Run:

```powershell
node --conditions=react-server --require ./scripts/tsx-windows-preload.cjs --import tsx --env-file=.env.local scripts/m8-cli.ts configure
```

Required JSON fields: `bookmaker`, `locale`, `operatorCampaignId` (actual approved identifier), `destinationUrl`, `destinationType` (`HOMEPAGE` or `SPORTSBOOK`), `enabled` (boolean), `validFrom`, `validUntil` (ISO dates), `placements` (array), `domains` (exact approved hostnames), `approvalReference` (private material reference). The tool requires existing bookmaker/GEO affiliate approval and never changes those approval flags. There is no public configuration API.

Optional `creatives` is an array with `id`, `placement`, `imageUrl`, `imageAlt`, `width`, `height`, `approvalReference`. Each creative must come from approved material, use a deployed first-party raster asset under `/sponsors/`, and have meaningful dimensions/alt text. No remote trackers or executable SVGs. Omitted creatives are disabled; an existing ID belonging to another campaign causes transaction rollback. The CLI validates local asset existence; deploying a newly supplied asset requires the usual release checks. Campaign changes for already deployed assets need no code deployment.

Stable placements: `match_odds_table`, `match_slip_comparison`, `match_right_rail`, `match_top_banner`, `match_inline`, `team_top_leaderboard`, `team_right_rail`, `team_inline`, `player_top_leaderboard`, `player_right_rail`, `player_inline`, `slip_bookmaker_comparison`, `home_top_banner`, `home_right_rail`, `competition_inline`, `mobile_inline`, `profile_mobile_inline`.

The global M7 drawer uses `slip_bookmaker_comparison`, including when opened on a match. `match_slip_comparison` is reserved for a future embedded match comparison. Competition sponsorship is restrained to the first canonical competition section on existing listing pages, with its competition identity resolved by the server. Desktop rails/top banners and compact mobile inline placements obey responsive visibility. No campaign means no slot markup, border, whitespace box or impression.

Labels are `Publicidade` / `Publicidad`; active CTAs include affiliate disclosure, honest homepage/sportsbook wording and nearby responsible-gambling notices. No prefilled-slip claim or bonus copy is fabricated.
