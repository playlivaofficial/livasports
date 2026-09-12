# LivaSports M4.1 — Data Capabilities

## Evidence boundary

The capability audit used current official Sportmonks v3 documentation, existing canonical mappings, and a maximum 15-request live diagnostic. The six mapped team samples were Athletico PR, Bahia, América, Fulham, Grêmio, and Flamengo, covering Brazil, Liga MX, a major European league, a domestic cup, and a continental club competition. No provider ID was guessed.

The first squad probe exposed a provider/documentation mismatch: `detailedPosition` was not accepted on the squad/player-statistic relationship and returned HTTP 404 with provider code `5013`. A two-request recovery used `include=player;position`, returned 33 Flamengo squad rows with identities and all four broad position groups, and verified a full player detail response. The production adapter uses the accepted include shape.

## Capability matrix

| Module | State | Verified evidence / product behavior |
|---|---|---|
| Team identity | AVAILABLE | Six team lookups returned canonical name and provider identity; public identity is LivaSports-owned. |
| Team image | AVAILABLE / PARTIAL | Real CDN paths were returned for enriched teams; initials fallback is used when absent or invalid. |
| Country | AVAILABLE | Team and player country/nationality relations were returned in the controlled sample. |
| Founded year | AVAILABLE / PARTIAL | Returned where present; never inferred. |
| Venue | AVAILABLE / PARTIAL | Team venue name/city returned where present; missing venue stays absent. |
| Current competitions/seasons | PARTIAL | Team `activeSeasons` was empty in the sample; canonical M3.6 team-season mappings remain the authoritative persisted context. |
| Coach | PARTIAL | Coach relation identifiers were observed, but no usable verified coach name was returned. UI omits coach. |
| Team season statistics | AVAILABLE / PARTIAL | 122 meaning-known rows persisted across three controlled teams; coverage varies by team/season. |
| Season squad | AVAILABLE | Accepted team+season squad endpoint returned player identity, jersey/position where supplied; 99 memberships persisted. |
| Player identity | AVAILABLE | Canonical player mapping plus name/identity fields verified. |
| Player photo | AVAILABLE / PARTIAL | 99 of 253 canonical players currently have a photo; fallback is deliberate for the remaining 154. |
| Player nationality/country | AVAILABLE / PARTIAL | Verified on detailed player responses; lineup-only identities remain partial. |
| Position/detailed position | AVAILABLE / PARTIAL | Broad position is available from squad data; detailed position is accepted on player detail but not the rejected squad include path. |
| Birth date | AVAILABLE / PARTIAL | Verified on detailed profiles; 154 lineup-only players currently lack DOB. |
| Height/weight | AVAILABLE / PARTIAL | Returned for detailed player samples where supplied. |
| Player season statistics | AVAILABLE / PARTIAL | 26 whitelisted rows persisted for four controlled players; provider coverage varies. |
| Current/historical team context | PARTIAL | Season squad membership preserves team+season context. The current sample has no multi-team player, so a transfer was not claimed as observed. |
| Fixture-level player statistics | AVAILABLE / PARTIAL | 131 persisted statistic rows; 174 lineup links and 69 event-player links connect profiles to Match Center. |
| Reusable statistic types | AVAILABLE | The Types reference endpoint is accessible and a provider/type dictionary is persisted. |

## Meaning controls

Only known metrics with an explicit value key are displayed. Team metrics include wins, draws, losses, goals, goals conceded, clean sheets, cards, corners, and average possession. Player metrics include appearances, starts, minutes, goals, assists, cards, shots, saves, clean sheets, and rating when the provider supplies a usable average.

Statistics remain scoped to player/team/competition/season. Missing is not zero, different competitions are not silently aggregated, and fixture values are not treated as season totals.

## Current limitations

- Detailed enrichment is a controlled three-team rollout, not a blanket import of all 1,343 teams.
- Only four controlled players currently have season-stat rows; lineup-linked players remain useful partial profiles.
- No current sample demonstrates one player across multiple teams or competitions; the schema preserves those keys without claiming observed transfer coverage.
- Coach names were not verified.
- Profile refresh automation is scheduler-ready but not running 24/7 on the current hosting setup.

## Official references

- [Sportmonks teams endpoints](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/teams)
- [Sportmonks team squads](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/team-squads)
- [Squad by team and season](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/team-squads/get-team-squad-by-team-and-season-id)
- [Player by ID](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/players/get-player-by-id)
- [Season statistics by participant](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/statistics/get-season-statistics-by-participant)
- [Sportmonks Types reference](https://docs.sportmonks.com/v3/core-api/endpoints/types/get-all-types)
- [Fixture lineups](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes/lineups)
- [Fixture/player statistics](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/statistics/fixture-statistics)
