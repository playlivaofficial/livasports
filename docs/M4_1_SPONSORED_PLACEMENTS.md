# LivaSports M4.1 — Sponsored Placement Boundary

## Current production state

**All profile sponsored placements are disabled.** The final database audit found zero active sponsor campaigns. No Betsson URL, GEO permission, creative, or tracking parameter was assumed; no Betano approval was invented.

When a campaign is absent, the React slot returns `null`. Team/player pages therefore render no placeholder, blank rail, layout gap, disclosure, outbound CTA, or impression event.

## Supported placement contract

- `team_top_leaderboard`
- `team_right_rail`
- `team_inline`
- `player_top_leaderboard`
- `player_right_rail`
- `player_inline`
- `profile_mobile_inline`

The reusable slot supports responsive creatives, localized sponsor labels, meaningful image alternative text, and `rel="sponsored noopener noreferrer"` on external new-tab links. Right-rail placements are hidden with the rail on tablet/mobile layouts. Sports-data ordering is independent of sponsor state.

## Eligibility contract

A candidate must be explicitly enabled and match:

- placement;
- locale/GEO;
- team or player entity type;
- optional campaign start/end window.

Tests confirm that disabled, wrong-GEO, wrong-entity, wrong-placement, and out-of-window campaigns are rejected. The schema stores only explicitly configured campaign creative and destination fields.

## Event boundary

The future M8-compatible event contract allows only:

- `sponsor_impression`
- `sponsor_outbound_click`

with event ID, placement, campaign, locale, entity type, and canonical team/player ID. It contains no fingerprint, deposit, revenue, or inferred conversion data. M4.1 does not build the M8 redirect/postback/attribution platform and does not claim conversions.

## Activation requirements

Before any slot is activated, LivaSports still needs an actually approved creative and destination, documented GEO permission, preserved tracking parameters, required disclosure/responsible-gambling copy, and a compliance review. Activation must not change standings, statistics, odds ranking, or sports information order.
