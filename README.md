# LivaSports

This repository contains the M2 read-only sports-data delivery experience, the M1 Next.js/TypeScript foundation, and the preserved M0/M0.5 provider-validation harnesses. The production path uses LivaSports-owned canonical models, Sportmonks for sports data, and OddsPapi for supported pregame odds. M2 does not contain a Bet Slip, accounts, live odds, player props, or the full Match Center.

Architecture details are in `docs/M1_ARCHITECTURE.md` and `docs/M2_DATA_DELIVERY.md`.

## Application development

Use Node.js 20 or newer and pnpm:

```powershell
pnpm install
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
pnpm run dev
```

Copy `.env.example` to a local `.env` for server-side provider access. Never commit real credentials. Missing credentials produce a safe localized unavailable state, and paid providers are not called during `next build`.

## M2 routes

Brazil uses pt-BR and `America/Sao_Paulo`; Mexico uses es-MX and `America/Mexico_City`:

- `/br`, `/br/futebol`, `/br/ao-vivo`, `/br/jogos/hoje`
- `/mx`, `/mx/futbol`, `/mx/en-vivo`, `/mx/partidos/hoy`

All route data is normalized into LivaSports-owned models before rendering. Live pages use canonical live statuses only, today pages use local calendar-day boundaries, and stale odds are never presented as current prices.

## M0/M0.5 validation harnesses

This is an isolated, server-side validation harness. It contains no website or client bundle and exposes only the provider-neutral `ProviderAdapter` contract to future application code.

## Run

1. Copy `.env.example` to `.env` and set `SPORTMONKS_API_KEY` to the token only. Never commit `.env`.
2. Export the variables into the server process (Node does not read `.env` automatically).
3. Run `npm test`, then `npm run validate`.

PowerShell example for the current shell:

```powershell
$env:SPORTMONKS_API_KEY = 'real-token-here'
npm run validate
```

Outputs are written to `output/`: normalized provider-independent odds, a structured JSON report, and a readable Markdown report. Generated outputs are gitignored because raw provider data may be licensed and time-sensitive.

The validator discovers upcoming fixtures dynamically, uses league country metadata for Brazil and Mexico, and balances the sample between the two countries where data is available. Mexican bookmakers are derived from returned fixture odds and are not hardcoded. Bookmaker presence does not itself prove that a bookmaker is licensed for or accepts residents of a GEO; that requires separate compliance evidence.

## OddsPapi M0.5

OddsPapi is implemented as a separate `OddsPapiAdapter`; the Sportmonks adapter and its output paths are unchanged. Export `ODDSPAPI_API_KEY` into the server process, run the four-call `npm run diagnose:oddspapi` first, then run `npm run validate:oddspapi`. The full staged run is capped at 14 billable calls by default, uses in-memory response caching, requests one tournament at a time for attributable errors, and writes only the OddsPapi report files.
