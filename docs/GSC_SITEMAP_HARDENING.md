# GSC sitemap write: root cause and durable boundary

## Proven production cause, 2026-09-30

Baseline: d3ae4890cc5a32911a85ad162badc56a6ed7dfd7 (PR #30 media shutdown retained).
The 07:10 UTC SEO run fetched /sitemap.xml in 202 ms and then /sports-sitemaps.xml.
Vercel request qzhl7-1790752258523-9f74fafc06b7 returned HTTP 200 in **12,187 ms**.
The caller had an unconditional **12,000 ms** timeout, no GET retry, and a catch-all that
converted a local sitemap preparation failure into `sitemapWrite=API_ERROR`.
Worker request rg88k-1790752242108-c725830b5361 finished after 28,475 ms.
Persisted `attempted_at` still equalled the previous successful 2026-09-29 11:48:22 UTC
submission: no Google PUT was attempted. This was not an invalid token or a rejected write.

A controlled production-equivalent replay refreshed OAuth successfully, verified full
webmasters scope and siteOwner on sc-domain:livasports.com, and returned 200 for analytics,
property and sitemap reads. The replay recovered the preparation error without a PUT;
the original 24-hour content-change cooldown still applied. A single warm success was not
treated as a fix. No credential rotation or property switch was necessary.

## Boundary and policy

Existing daily SEO Autopilot -> existing sitemap decision -> canonical roots and children
-> validated semantic URL/lastmod fingerprint -> durable per-root claim -> OAuth refresh
and property/scope checks -> Google PUT -> fenced persistence/audit.

- Only https://livasports.com/sitemap.xml and /sports-sitemaps.xml are submitted.
- Strict namespace-aware XML validation rejects HTML, malformed XML, unsafe entities,
  non-canonical hosts, invalid URLs and oversized/nested indexes.
- Public GET budget is 20 seconds, enough for the observed cold response, with one retry
  after one second for a transient GET failure; at most two GET retries for the entire cycle.
- Whole maintenance cycle is bounded to 65 seconds, reduced if Autopilot is near its runtime
  limit. Child fetch concurrency is two; active pairs settle before releasing a lease.
- Submit new roots or materially changed URL/lastmod content, at most once per root per
  24-hour normal change window. Unchanged successful hashes never trigger a probe PUT.
- One PUT maximum per root/cycle. Transient/network retries are deferred to existing daily
  executions, exponentially backed off 1/2/4/8/16/24 hours. Quota waits at least 24 hours;
  Retry-After can extend that to seven days. There is no extra cron or polling loop.
- Auth/permission/invalid property/invalid sitemap failures are blocked, not blindly retried.
  Validated sitemap correction or changed scope/property/permission context permits recovery.
- A 180-second atomic per-root lease (no heartbeat) and lease-token fencing prevent overlap.
  Crashed workers expire; a PUT with uncertain outcome is checked against Google readback
  before another write. No distributed protocol can guarantee exactly-once execution across
  Google acceptance and a database outage; the readback reconciliation minimizes that gap.
- Successful hashes/timestamps survive failures. Preparation errors are distinct from Google
  write errors. Safe diagnostics contain stage/category/status/finite reason, not raw bodies,
  request headers, tokens or credentials. Last eight root audit events are retained.
- Unexpected maintenance/persistence failures cannot cancel successful SEO intelligence.

## Owner and release

Owner SEO displays each canonical sitemap URL, last check, last actual attempt, last proven
submission, state, normalized error, failure stage/HTTP status and retry due/scheduled/blocked.
Opening the dashboard makes no Google/provider request.

Migration 053 adds only sitemap state columns. It does not rewrite historical success,
change product schemas or delete data. Apply through the existing migration runner after
review/gates, before the new production code; the previous release tolerates the additions.

SEO V2.1 publication/scoring/thresholds, Top10/Top5, public sitemap eligibility/URLs/canonicals,
odds, affiliate, My Slip, GEO, auth, schedules and media shutdown are unchanged.
No new video/audio jobs may be created by any verification cycle.

## Verification

Tests cover the observed 12.187-second preparation latency, strict XML/fetchability failures,
realistic success/dedup, overlapping claims, failed-write history preservation, 5xx/timeouts,
429/Retry-After/quota, 401/403, invalid property, corrected content, ambiguous-write readback,
healthy analytics during failures and continued SEO work after maintenance exceptions.
Production acceptance must include one legitimate due submission, Google readback, two
subsequent unchanged skips, owner browser QA, providerRequests=0 and unchanged media counts.
Release-specific SHA, deployment and acceptance evidence are attached to the release PR.

Google submit contract: https://developers.google.com/webmaster-tools/v1/sitemaps/submit
Quota reference: https://developers.google.com/webmaster-tools/limits
External Google outages remain possible; the guarantee is classified, bounded recovery, not
that an external API can never fail. Submission never guarantees indexing or ranking.
