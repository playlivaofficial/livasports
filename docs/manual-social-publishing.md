# Manual social publishing

Base: production/main `9189207c8d6f52b0105afb4d499d1c0bb733b546` (verified before implementation).

## Audit

The existing owner queue already had deterministic Top 5/10 ranking, immutable content packages, per-platform copy, MP4/PNG routes, channel approval states, creative versions, asset hashes, owner authentication, CSRF checks and first-party UTM analytics. Missing: clipboard controls, useful download filenames, current-version download guards, exact posting receipts, external post URL/private notes, paginated posting history and completion counts. The old production-history read excluded superseded packages. No new renderer, ranking engine, speech provider or publishing API is needed.

## State and identity

There is no parallel mutable status column. Existing channel statuses remain DRAFT, APPROVED, REJECTED and PUBLISHED. The UI derives READY_TO_POST from a usable, non-degraded current-stack MP4 and eligible DRAFT/APPROVED channel; approval is shown separately. Deliberately confirming a reviewed manual post atomically approves (if necessary), records an immutable receipt and marks the channel PUBLISHED (shown as POSTED). Rejected content cannot be posted. Superseded content is history only.

A receipt pins fixture, platform, content identity (facts + story angle + rendered asset SHA), creative-stack version, item/revision, asset hash, generated timestamp, posted timestamp, owner-session pseudonym, exact stored title/caption/hashtags/CTA, tracked URL, story/family and optional private URL/note. An advisory fixture lock and database uniqueness prevent duplicate receipts. New material asset bytes or a new creative version require a new decision; an unchanged carried asset can still resolve to its original receipt. No raw auth/session token is persisted.

Migration 046 is additive; old content, media and channel timestamps are preserved. Legacy PUBLISHED records are not retrospectively claimed to have exact posting receipts. No auto-marking or synthetic external URL occurs.

## Owner workflow

`/owner/growth`: current Top 5 platforms are open; other Top 10 opportunities are collapsible. Download links include expected creative version/hash and are revalidated by the server against the newest unsuperseded item. Historical asset links are explicitly separate. Filenames contain platform, safe team slugs, kickoff date and revision. Static PNG is labeled as fallback.

Copy actions consume stored content only. YouTube uses its stored description and a separate title action. Full post text = caption/description + blank line + hashtags + blank line + tracked URL. Clipboard failure exposes selectable text. Instagram explicitly warns that caption URLs are not clickable. Mark-posted requires a platform-specific confirmation and checkbox; it does not call any social API. State updates fetch a fresh owner snapshot without reloading the document.

Posting history is paginated (50 per page), with platform/fixture/date/version filters and a superseded filter. It shows exact original assets and copy, private notes and real first-party funnel metrics. Completion uses the current Top 5, not the historical generation shortlist; today's counts use São Paulo time.

## Attribution and safety

Existing source/medium/campaign values remain unchanged. New manual links use the existing `utm_content` field: `match_<public fixture id>_r<revision>_<12 hash characters>`. The fixture public ID/revision/asset digest are not secrets. Original fixture-level UTMs still work. Migration extends the existing reporting dimension with exact receipt links; it does not introduce a second event system. Growth Dashboard aggregates both link identities. Receipt metrics join HUMAN sessions/events only and show sessions, match views, odds interactions, slip additions and server-confirmed outbound redirects, not deposits or revenue. Platform-side engagement data remains unavailable.

Owner routes retain signed authentication, no-store/noindex, request limits, same-origin/HTTPS checks, bounded JSON and explicit input allowlists. Optional post URLs must be HTTPS without embedded credentials; they are never fetched by the server or exposed publicly.

## QA

`scripts/manual-publishing-db-qa.ts --rollback` validates migration and real SQL persistence/duplicate/history/new-revision behavior in a transaction that always rolls back. It reuses existing bytes and never renders/synthesizes. It must be launched with its restricted QA preload. It is not an external publishing operation. Production UI QA is a separate deliberate owner-authorized receipt labeled as release QA, not a real social post.

Unrelated baseline: the unchanged odds scheduler budget test exceeds its 5-second timeout on this Windows host (also reproduced on a detached `9189207` baseline). No timeout or assertion was weakened. Render-heavy tests are run separately to avoid contention.

Auto-publishing, OAuth, scheduling external posts and billing changes are explicitly deferred.
