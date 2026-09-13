# Standalone G1 QA

Run from the repository root using the existing private `.env.local`:

```sh
npm run qa:g1:publisher
npm run qa:g1:commercial
```

These commands expand to:

```sh
node --require ./scripts/tsx-windows-preload.cjs --import ./scripts/g1-qa-preload.mjs --import tsx --env-file=.env.local scripts/g1-publisher-db-qa.ts
node --require ./scripts/tsx-windows-preload.cjs --import ./scripts/g1-qa-preload.mjs --import tsx --env-file=.env.local scripts/g1-commercial-qa.ts
```

The preload supplies the same empty `server-only` mock used by the repository's
Vitest tests, through a [Node module resolution hook](https://nodejs.org/api/module.html#moduleregisterspecifier-parenturl-options).
It accepts only these two script entry points and intercepts only the exact
`server-only` specifier. Other imports and React export conditions are unchanged.
Production imports retain the sentinel. Keep this preload out of `NODE_OPTIONS`,
Next.js configuration and application imports.

Publisher QA rehearses migration 013 and the private publisher configuration
inside one transaction, deliberately rolls back, and compares before/after
state. Its PASS result includes `rolledBack: true` and `providerRequests: 0`.

Commercial QA validates the intended state after a separately authorized
configuration write. It requires migration 013 recorded exactly once and both
publisher columns, and runs the original production readers in a database-enforced
read-only transaction. The former pre-013 query adapter has been removed.

Its expectations are one enabled, approved Betsson BR campaign matching the
private campaign-1 identity; exact destination and domain equality; the configured
ten placements; and seven approved, enabled creatives. Each creative must match
its configured ID, delivery, source, dimensions, placement, locale, alternative
text and dates, and pass production active-creative validation. Unexpected
enabled creatives fail, including those under retired campaigns. Disabled
historical creatives may remain. Betano stays disabled and MX stays isolated.

Health and report serialization are checked for private fields, raw or encoded
destinations/sources, and opaque tracking values. Safe check names use creative
ordinals rather than private IDs. Provider counters are compared before and after
the reads. No production validator or sentinel is changed to make QA pass.

The current three-placement, zero-enabled-creative database state is expected
to fail this post-configuration QA. Do not configure the live campaign merely to
make the gate green. Regression tests use synthetic fixtures to verify success
for the intended state and rejection of incomplete or mismatched state; the
publisher command continues to provide a rollback-only rehearsal.

Reports remain in ignored `output/*-private.json` files and contain no raw
destinations. QA success records a rehearsal and a read-only verification;
it does not authorize applying a migration, activating creatives or deploying.
