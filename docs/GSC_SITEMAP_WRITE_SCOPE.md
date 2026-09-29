# Search Console sitemap write boundary

The production 403 was Google's `ACCESS_TOKEN_SCOPE_INSUFFICIENT`: the existing OAuth refresh grant had `webmasters.readonly`. Property ownership (`siteOwner`) does not expand OAuth scope. Sitemap submission requires `https://www.googleapis.com/auth/webmasters`; both analytics and sitemap reads accept this scope.

## Credential repair

Use the existing dedicated LivaSports Google OAuth client, not the user-login or YouTube client. Authorize full `webmasters` with offline access through a one-use PKCE loopback callback. Verify the refreshed token's returned scope, configured property (`sc-domain:livasports.com`), property permission and both reads before updating only the existing production GSC refresh secret. Credentials remain in memory or the authorized encrypted secret store; none belong in Git, reports or browser assets.

Existing deployments retain their old environment until a new deployment. Do not interpret local authorization as production verification. No recurring consent, manual indexing or sitemap resubmission is part of normal operation. Google revocation/expiry can still require reauthorization.

## Runtime and health

- Only the leased SEO Autopilot worker probes Google and submits the two allowlisted sitemap roots.
- The worker refreshes one access token per cycle, reads property permission, a one-row analytics sample and sitemap listing. Every new probe has a bounded timeout; no blind retries.
- Missing/readonly/unknown scope and restricted/unverified property permissions fail closed for writes. Reads remain independently reported.
- Raw Google bodies, tokens, headers and private credential JSON never enter run summaries. Errors become allowlisted classifications; scope-insufficient 403 is distinct from property denial.
- The owner SEO page reads the latest durable `gscHealth` from existing `seo_autopilot_runs.summary`. It makes no Google or sports-provider requests. No schema migration is needed.
- `sitemapWrite=OK` means an actual successful submission was recorded, not merely that full scope exists. The panel includes the check time and last successful submission time; unchanged cycles reuse that evidence without sending a test write.
- Google read/write failures do not change opportunity scoring, publication gates, thresholds or social generation.

## Deduplication and recovery

The actual URL/lastmod content hash, persisted submitted hash and 24-hour attempted-at backoff are unchanged. Successful writes persist the submitted hash/time; errors never advance it. An unchanged sitemap is never resubmitted, even on another day. Changed content respects the existing daily backoff. There is no Indexing API integration.

For the one-time credential repair, an operator may clear only the failed attempt timestamp for the two known roots whose error is the legacy scope-required 403, after verifying the new full scope and siteOwner. Preserve hashes and successful submissions. This is a scoped recovery, not a runtime bypass or repeated reset.

## Release evidence required

Before completion: hosted CI and preview, production SHA match, analytics/list HTTP 200, real PUT HTTP success, Google list readback with a new lastSubmitted timestamp, and an immediate identical worker rerun with zero SUBMITTED results and unchanged submitted timestamps/hashes. Also verify owner-only/noindex health, canonical/sitemap regression, normal providerRequests=0 and no credential leakage. Sitemap submission is not proof of crawling, indexing or ranking.
