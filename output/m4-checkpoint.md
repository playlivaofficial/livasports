# LivaSports M4 — Release Checkpoint

Checkpoint date: 2026-09-08 (Asia/Tbilisi)

## Completed

- Migration applied and idempotent.
- Controlled five-fixture enrichment and controlled second run complete.
- Database duplicate/lease audit complete.
- Match routes, modules, SEO, localization, analytics, cache isolation, stale-state handling, and pregame odds boundary implemented.
- Canonical 308 and real 404 route guard implemented and locally verified.
- Desktop/tablet/mobile visual QA complete at 1440/768/430/390/375.
- Sportmonks usage fixed at 29 for M4; OddsPapi usage fixed at 0.

## Production-safe limitations

- No real live production match was observed; development-only replay is labeled.
- 24/7 upstream refresh scheduler is not operational.
- Coach names absent in the controlled data.
- Form/H2H depth is limited to stored history.
- 134 unmaterialized provider identity reservations from M3.6 are not referenced by product rows.

## Release resume point

1. Run tests, typecheck, lint, build, migration audit, database audit, and secret scan.
2. Review rendered final screenshots and route responses.
3. Commit/push `codex/m4-match-center`.
4. Merge without force into `main`, push, and verify synchronization.
5. Deploy only the already-linked LivaSports Vercel project.
6. Run production routes, canonical/404, cache, log, mobile, HTTPS/www, provider-call, and secret-exposure QA.
7. Amend the final report with real commits and deployment identifiers.

Do not run another provider sync unless a new evidence gap is discovered. Do not start M4.1 or M5.

