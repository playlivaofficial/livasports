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

Commercial QA uses a database-enforced read-only transaction. Against the
pre-013 schema, its QA-only query adapter projects the two future creative fields
as the existing IMAGE delivery type and a null embed source. Actual rows,
destinations, eligibility filters and production readers remain unchanged.
With both publisher columns present, it uses the original query unchanged;
a partially migrated schema fails. The report identifies the inspected schema.

Validation on the preservation branch: publisher 27 checks passed; commercial
13 checks passed against `PRE_013`. Independent state comparison confirmed
unchanged campaign, link and creative contents, unchanged attribution/provider
counts, and absent migration 013 and publisher columns.

Reports remain in ignored `output/*-private.json` files and contain no raw
destinations. QA success records a rehearsal and a read-only verification;
it does not authorize applying a migration, activating creatives or deploying.
