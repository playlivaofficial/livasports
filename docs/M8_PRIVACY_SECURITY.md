# M8 privacy and security

M8 sets no advertising/session identifier cookie, stores no full IP, IP hash, user-agent, referrer, fingerprint, account/password or raw client metadata. The existing click table's legacy PII columns remain null, enforced by an M8 database check. HMAC-protected context and short-lived random view IDs identify a rendered offer, not a person. Canonical public page paths contain no query strings.

The existing product-event abstraction uses tab-scoped session storage for ten-second delivery deduplication. M8 stores only an offer signature suffix and timestamp in that dedup key, never the signed selection payload or destination. This state expires with the tab and is not a cross-page user identity.

`AFFILIATE_ANALYTICS_MODE` supports `anonymous` (default, minimized first-party events), `off` and `consent`. DNT/GPC opt-out suppresses M8 analytics. Consent mode requires the first-party `livasports_analytics_consent=granted` choice; no new consent is fabricated and no CMP is claimed. Sports content and eligible navigation work independently of analytics consent. No IP/user-agent values are retained after classification.

Retention: 30 days for impressions, 90 days for M8 click rows and 395 days for real operator evidence if an integration is later implemented. `m8-cli.ts prune` deletes bounded batches of up to 5,000 per table and records maintenance time. Run repeatedly to drain a backlog. This is an explicit protected operator procedure; no recurring retention scheduler or paid service is claimed. Operations shows the last cleanup. Existing non-M8 product analytics retains its existing policy.

Commercial secrets are server-only: database destinations, real campaign references, database/provider credentials and `AFFILIATE_SIGNING_SECRET`. The signing key is independently generated for local development and the existing Vercel production/preview scopes. Vercel stores it as a sensitive variable; [Vercel documents sensitive variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables). No operator credential was generated. Rotate the signing key through secure environment settings and redeploy; previous offers immediately fail verification.

GEO trusts Vercel's country header only on Vercel. Local tests can explicitly use `AFFILIATE_QA_GEO`; never configure that test override on production. BR destinations are not inherited by MX. Domain validation fails closed independently of token signature.

Public routes expose no configuration dashboard. Health requires the existing constant-time scheduler secret authorization. Logs contain only sanitized event codes, canonical placement/locale/bookmaker and classification. Redirect destinations, signatures/tokens and operator campaign IDs are never intentionally logged by application code. Platform access-log URL retention remains governed by hosting access controls; signed offer context has a maximum five-minute lifetime.
