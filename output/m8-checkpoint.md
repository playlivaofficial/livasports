# M8 checkpoint

Branch: `codex/m8-affiliate-conversion-hardening`, based on synchronized M7 main `f27720cd973e6d993146a29e1abb3ccbf63e1681`.

All local gates passed: 6 Node + 366 Vitest tests, typecheck, lint, final production build, 16 database checks, 114 controlled browser checks, 14 focused viewability checks, security/HTTP checks and M3–M7 regressions. Migration 012 applied once; repeat returned no migrations. Signing configured securely for the existing Vercel production/preview project and local development. No operator destination, campaign, creative or conversion configured. Betsson BR odds/affiliate approval preserved; Betano BR odds-only preserved.

Feature `1cfb522eeef4b5daf2f9c1bde22d3fb259ad6320` pushed; safe main merge `af4c00da2f1e5d6c43b4e044a9754877a9ee005a` pushed. Existing Vercel application deployment `dpl_5BxYoPbssLATX27esCtccd5UAbQ2` READY with matching apex alias. Production route, M7 HTTP (17), M8 HTTP (25), page (31), persisted-slip browser (27), protected operations, secret scan, runtime logs and HTTPS/www checks passed.

Baseline retained: 34 competitions, 904 fixtures, 1,343 teams, 253 players, 651 quote rows, 1,563 history rows. Provider counters remain 22 OddsPapi / 262 sports requests, M8 delta zero. Affiliate impressions/clicks/conversions zero. Final evidence commit is published to main and its exact READY deployment and clean/equal Git state are verified before the completion message. No work after M8.
