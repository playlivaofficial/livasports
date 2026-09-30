# Social media cost shutdown — 2026-09-30

## Product boundary

The site discovers real fixtures, applies the existing deterministic Brazil-first scoring and diversity rules, refreshes Top 10 / Top 5, and persists lightweight SEO priorities. **Execution stops there.** The owner chooses a fixture and produces media externally. No replacement renderer or auto-publisher was added.

`runGrowthSelection` is the shared cron/owner refresh entry point. It does not acquire a generation job, scan media history for gaps, render/repair assets, synthesize voice, retry rendering, upload anything, or change media metadata. Old forced regeneration calls fail closed. Owner regeneration actions return HTTP 410 before DB access. The old CLI render/regeneration commands also fail closed.

The implementation retains offline renderer/test source and historical read/download routes; neither is scheduled or reachable as a production rendering action. Existing media bytes, checksums, voice clips, channel states, posting records, and job history remain untouched. No migration, deletion, or infrastructure-plan change is required.

## Workload audit

| Component | Classification | Disposition |
| --- | --- | --- |
| Vercel `/api/internal/growth-refresh`, 10:17 / 16:17 / 22:17 UTC | Shared | Schedule retained; selection + SEO metadata only |
| Owner Growth GET / refresh and dashboard | Shared | Live ranking and historical reads retained; rendering controls removed |
| `service.ts` rendering/repair loop | Video-only | Removed from execution path |
| Social/canonical/video renderers, FFmpeg, frame assembly | Video-only | No production runtime caller; source/history retained |
| Voice synthesis and `growth_voice_clips` read-as-update/insert cache | Video-only | No production caller from cron or owner actions |
| Music/SFX synthesis and render-time mixing | Video-only | No scheduled invocation; historical source/assets retained |
| `growth_generation_jobs` acquire/expire/finish writes, 600s lease and heartbeat | Video-only | Not called by refresh; historical rows preserved |
| `growth_content_items`, platform/canonical assets and current-queue repair writes | Video-only | No refresh writes; historical/manual posting behavior retained |
| `growth_seo_priorities` | Required | Existing metadata upsert retained, short transaction lock prevents overlapping writes |
| Fixture reads, scoring/config, shortlist/diversity, Top 5 subset | Required | Unchanged |
| SEO Autopilot V2.1, GSC, authority/SEO refresh | Required | Code and schedules unchanged |
| Odds Vercel cron, GitHub fallback ticker, external primary ticker | Required | Entirely unchanged |
| GitHub Quality gates | Required | Unchanged |
| Video GitHub schedule, separate render worker, DB polling loop | Video-only if present | None found in repository or hosted workflow inventory |
| Scheduled SQL | N/A | Production extensions: `plpgsql`, `pgcrypto`; no `pg_cron` |
| Blob/object-storage uploads | N/A | This pipeline stores media in Neon bytea, not a Blob uploader |

Vercel browser audit confirmed all five existing cron schedules enabled. Hosted GitHub inventory contains only Quality gates and Odds scheduler ticker. No billing, compute, storage, provider subscription, or cron-frequency changes were made.

## Preserved invariants

No scoring weight, competition/club priority, explainability, diversity, eligibility, Top 10/Top 5 size, odds pipeline, affiliate behavior, public UI, locale, auth, SEO page, GSC integration, sitemap/canonical rule, SEO experiment or publish threshold changed.

Shortlist writes use a transaction-scoped advisory lock, not a durable video job or heartbeat. A slower old refresh cannot overwrite a newer committed ranking. Failed reads throw once; existing metadata remains committed and no render retry is scheduled. Empty eligible inventories remain empty—no synthetic production fixtures.

## Verification / release acceptance

- Tests prove unchanged scoring and diversity, new high-priority fixture replacement, repeat/empty runs, no media writes/leases/repairs/retries, stale owner controls blocked before DB access, and historical/manual-state behavior.
- Build traces must exclude FFmpeg and the formerly forced character/scenery/font/music bundles from both Growth functions.
- Production: compare media/job/voice counts and metadata fingerprints before/after one authenticated selection refresh and one repeated refresh. Expect Top 10 / Top 5 and `providerRequests: 0`, `generated: 0`, `jobId: null`, `mediaGeneration: DISABLED`.
- Inspect owner Top 10 and history; test existing media download; inspect unchanged SEO/GSC health and public routes. Preserve all pre-existing user data.
- Release evidence is attached to the release PR after production acceptance; no speculative PASS is recorded here.

## Cost expectations and limitations

Removed: render CPU/memory, FFmpeg work, paid synthesis, voice-cache use-count writes, generation job/lease/heartbeat/status writes, image repairs, media persistence, and media-history scans on cron. Required three-daily ranking DB wakeups remain. Historical byte storage and manual downloads still incur their normal storage/read cost; nothing was purged. No dollar savings are asserted.

Offline renderer QA source is retained for history and deterministic tests, not operated as a service. Internal content-policy validators are risk reduction, not platform approval. An intentional future reactivation requires a reviewed product/code change, not an environment toggle.
