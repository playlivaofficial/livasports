# M8 operations

The existing production project is `nikapopkha3-4447s-projects/livasports`, ID `prj_AWVpxaSj2mI7RI7MlwmrnMW6Ogvr`. No new project or service tier is required.

Local protected commands (database credentials come only from the ignored environment):

```powershell
node --conditions=react-server --require ./scripts/tsx-windows-preload.cjs --import tsx --env-file=.env.local scripts/m8-cli.ts health
node --conditions=react-server --require ./scripts/tsx-windows-preload.cjs --import tsx --env-file=.env.local scripts/m8-cli.ts prune
```

`GET /api/internal/affiliate-health` requires `Authorization: Bearer <existing CRON_SECRET>` and returns no-store masked status. Never paste that credential into a URL. Status includes signing readiness, campaign enabled/approved/configured state, GEO eligibility, placements, creative count, dates, impression/click/CTR metrics, QA counts, sanitized last redirect error, last retention maintenance, postback state and last actual conversion receipt. Counts of zero are not missing-data conversions.

For a missing CTA, check independently: bookmaker/GEO affiliate approval; secure destination/campaign; placement/dates; trusted visitor country; actual pregame quote freshness; complete M7 same-bookmaker coverage; signing setup. Betsson odds eligibility must not be disabled to represent missing destination configuration. Betano approval remains false until real approval is supplied.

For a missing sponsor, also check exactly one approved matching creative, deployed first-party asset, dimensions and responsive placement visibility. Do not create a placeholder ad. Campaign edits use the secure configuration procedure in `M8_CAMPAIGNS.md`; a fresh view resolves current configuration and every outbound activation rechecks it. Disable a campaign immediately using the same configuration with `enabled:false`; already rendered offers then fail closed.

Database migration `012_m8_affiliate_conversion.sql` is additive, rehearsed in a rollback transaction and recorded once in `schema_migrations`. No real campaign/destination/creative/conversion is seeded. The separate commercial pool has bounded waits; optional failures do not fetch provider data. Local signing/GEO QA is never a source of live bookmaker eligibility.

Retention cleanup is manual and bounded; schedule it only through an explicitly configured supported operational runner. Continuous odds automation remains **not operational on the current Hobby setup**. M8 does not enable it, purchase an upgrade or claim that an affiliate deployment refreshes odds.

Release gates and production evidence are recorded in `output/m8-report.md` and `output/m8-checkpoint.md`. Rollback code through a normal reviewed commit/redeploy if necessary; do not remove additive tables or discard attributable evidence. No force pushes.
