# Growth VNext: one campaign, three canonical assets

## Preserved

The approved scoring weights, diversity-aware Top 10 order, SEO prominence upsert,
canonical URLs, three daily scheduler times, manual-post ledger and attribution
events remain in place. Social is now exactly the first five entries of that
ordered Top 10; the old secondary social diversity pass could promote rank 6–10
into generation and is deliberately no longer applied. No unrelated product,
affiliate, odds, auth, sitemap or canonical/hreflang changes.

## Storage and generation

Migration 048 is additive: `growth_canonical_assets` holds exactly one MP4 master,
one 1080×1920 story PNG and one 1080×1350 feed PNG per revision. Manual receipts may
reference the shared master asset, but retain independent channel, timestamp,
copy snapshot and UTM source. Legacy platform rows and receipts remain untouched.

`masterSocial` is the sole persisted narrative. Compatibility projections support
existing manual-publishing code without storing three scripts or blobs. The
production service and QA CLI render only that master. PNG generation has its own
entry point and never calls the voice provider or video renderer. Missing PNGs
are repairable against the original stored campaign without replacing its MP4.

A scheduler lease covers selection through commit, a per-fixture transaction lock
covers revision creation, and a partial unique index protects master content
identity/version. Unchanged completed packages skip rendering. Ranks 6–10 receive
SEO updates only. Voice-incomplete results are rejected before persistence; an old
revision is never replaced by degraded media. A bounded five-item batch stops
before the invocation deadline and reports pending work explicitly.

New revisions reset platform posting decisions. Historical posted/approved
versions remain immutable history, including their original asset hashes.

## Motion and local benchmark

The master eliminates continuous camera resampling, pan, hero drift and exit
movement. Readable text is stable; scene joins alternate short dissolves/wipes.
Transition durations land on whole frames; final frame PTS is a constant cadence.
The selected target is 18 fps, verified in Preview and production serverless runs.

Real São Paulo–Santos sample:

| Setting | Runtime | Encode | Bytes | Node peak RSS | Decoded cadence |
| --- | ---: | ---: | ---: | ---: | --- |
| 15 fps | 24.063 s | 13.133 s | 2,621,055 | 314 MiB | 378 frames; 1/15; no repeated decoded frames |
| 18 fps | 22.635 s | 13.985 s | 2,409,672 | 315 MiB | 453 frames; 1/18; no repeated decoded frames |

Total runtime is not a pure fps comparison: 15 fps included three cache misses,
while 18 fps reused all four narration clips. Encoding increased about 6.5%.
Node RSS excludes FFmpeg. These local numbers do not prove Vercel headroom.

Fortaleza–Athletic Club at 18 fps: 30.021 s total, 16.863 s encode, 2,224,477
bytes, four complete narration lines. The two samples used 384 newly synthesized
characters in total. Account quota read returned `missing_permissions`; no billing
or subscription changes were made.

Old São Paulo revision stores three videos totalling 10,211,136 bytes and 72.008 s
of recorded render time. One new 18 fps video is 2,409,672 bytes; its two PNGs add
4,206,734 bytes. Five rather than fifteen video renders is a structural 66.7%
reduction. Static storage must be included when reporting total package savings.

## QA entry points

`scripts/master-qa.ts` defaults to cache-only local render. `--synthesize` is an
explicit opt-in for a paid cache miss; `--production-voice` reads only existing
voice configuration into process memory. It never changes credentials or billing.
`migration-check` applies and tests migration 048 inside a transaction that always
rolls back. `scripts/master-decode.mjs` decodes local MP4s and extracts scene frames
without generation or network access.

## Release evidence (2026-09-27 UTC)

PR #16 deployed as `e6e18e90e5886344698822241f9973269e8bce27` with additive
migration 048. Preview generated five full packages in 108.642s. Production
generated five full packages in 109.818s; a second invocation took 2.412s and
generated zero, skipped five, with all 15 asset hashes and voice-cache usage unchanged.

Persisted Top 5: São Paulo–Santos, América Mineiro–Juventude, Novorizontino–Goiás,
Avaí–Ceará, Fortaleza–Athletic Club. All five source snapshots match canonical
teams, competition and kickoff. Current Top 10 headers and public prominence
read canonical fixtures directly; old historical snapshots are not overwritten.

All five MP4s decoded at uniform 1/18-second cadence, no identical consecutive
decoded frames, H.264 1080×1920 plus AAC. All have four complete narration lines
inside their scene intervals. Full audio decoding found non-silent audio and no
sample clipping. Ten PNGs decoded at exactly 1080×1920 / 1080×1350. First/context/
odds/CTA frames and both statics were visually inspected for every production item.

For the same five fixtures, old 15 videos total 51,077,846 bytes and 387.225s of
recorded render time. New five videos total 13,356,370 bytes and 91.826s, plus
21,353,091 bytes of statics: 32.0% smaller total new packages, 73.9% smaller video
storage, 76.3% less recorded video-render time. Historical data remains stored;
these are per-new-campaign savings, not bytes deleted from the database.

Production reused 13/20 voice clips and synthesized seven (450 characters).
Unchanged follow-up: zero synthesis. ElevenLabs quota remains unreadable with
the configured key (`missing_permissions`). No billing changes.

Owner production UI verified at 320/390/430/1280 widths with no horizontal
overflow, five players and ten images, independent posting controls, previews,
downloads and copy controls. One existing posted receipt, finalized channel
and all 372 historical video metadata/hash rows stayed unchanged. A rollback-only
isolated DB test proved three independent receipts sharing one canonical asset,
distinct UTM sources and duplicate-post rejection. No fake production posts.

Growth cron remains 07:17 / 13:17 / 19:17 São Paulo. Temporary QA deployment,
automation bypass and task-owned QA schema were removed. No automated social
publishing is implemented. A follow-up test/documentation-only change aligns the
old two-fixture batch assertion with the measured five-master architecture; it
does not change creative version or regenerate media.
