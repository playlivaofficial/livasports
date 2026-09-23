# Premium Creative — release evidence

## Scope and protected baseline

Continue `feat/premium-creative` from `b28109a992d24e99db12f00645b141cf5174145e`.
Production baseline: `b22df964c4daa46ba46adbf6374fc38039b4fecc`.
Inherited commits `a9ffaa6`, `8ba63e1`, `b28109a` are preserved, not rebuilt.

Brazil-first weights, shared SEO ranking, canonical destinations, M1 sitemap/hreflang policy,
odds ingestion, bookmaker insurance, accounts, slip, affiliate redirects and attribution are unchanged.
The inherited shortlist fix fills quotas on sparse calendars without changing scoring weights.

## Creative implementation

- Ten owner-approved original PNGs, byte-preserved with alpha: two identities, five poses each.
  See `public/growth/characters/approved-v1/README.md` for provenance. These are fictional Liva
  characters, never evidence of actual player participation, affiliation or endorsement.
- Fabric-only kit tinting, approved face/skin/hair/boots preserved. Known team-inspired palettes;
  explicit neutral Liva palette for unknown clubs. Away kit inversion avoids identical colours.
- Deterministic slate/rank selection and recent same-club creative history penalties. Original
  character and crest-led families alternate; identities swap home/away, and pose pairs differ by platform.
  Previous choices remain in immutable content revisions and the additive history view.
- Five football environment treatments plus original-character world: stadium, pitch, tunnel,
  editorial, crowd. Two generated fictional raster environments replace the dotted-crowd look;
  prompts/provenance in `public/growth/scenery/v1/README.md`. Approved characters were not redrawn.
- Governed LivaSports.com lockup in video AND PNG exports. Three compact secondary PlayLiva.com
  placements; no prize or product claims.
- TikTok: left-led hooks, cut/slide pacing and tilted action stack. Reels: centered editorial layout,
  smoother transitions and circular CTA. Shorts: factual context before matchup, numbered CTA and
  persistent summary treatment. Long team names shrink at word boundaries, never ellipsize.
- Expanded story-aware PT-BR hook/context/CTA pools. All social odds copy is generic: no bookmaker
  name, hidden insurance, source label or made-up probability is rendered. The odds scene uses editorial
  1–X–2 typography, not app buttons or a fabricated price/probability graph.
- Owner-approved final polish: compact whole-word club labels (including Athletic Club), restrained
  crest/name strips, ten hook choices for the common table/watchlist angles, seven CTAs per platform,
  six context and six odds headlines per platform. Character art, atmosphere and lockups unchanged.

## Audio and runtime

Existing ElevenLabs integration retained, configured through server environment only. The existing
local key was securely installed as encrypted Preview + Production environment variables on 2026-09-24
at the owner's explicit request. No value is in source, logs or this report.

Both voice IDs remain configurable. Owner accepted the real TikTok voice sample on 2026-09-24.
Default voices are multilingual; do not claim native Brazilian provenance for the voice actors.
Every clip is measured before encoding: scene durations expand to fit speech, captions share the
persisted timeline, audio starts 0.1s into its scene, and no line is truncated into the next scene.
AAC stereo, synthetic seeded ambience, loudness normalization and limiting; no licensed music.
Degraded audio is explicitly marked NEEDS_REVIEW, not silently treated as complete narration.

Sequential encoders and fixture-level media/synthesis caches remain. One scheduled invocation has
three-fixture maximum, a 250s rendering deadline and 300s route ceiling. Individual FFmpeg and voice
operations are bounded. New video payloads are capped at 4,000,000 bytes, below Vercel's 4.5 MB
function-response limit; duration-aware bitrate cap preserves direct owner downloads.

Measured 15-video pre-payload-cap run: 295.5s including four contact sheets, Node peak RSS 268 MiB,
FFmpeg peak working set 983 MiB, one concurrent encoder. Each fixture's three renders took 53–59s.
These are local Windows measurements, not a claim about deployed memory. Final constrained run and
deployed measurements must be recorded before release completion.

Final owner-polished Top 5 × 3: 15/15 fully narrated outputs, 2,433,967–3,696,545 bytes;
all 75 speech clips fit their scenes. Four contact sheets (60 panels) re-inspected with no clipping.
289.8s including contact sheets, Node peak 259 MiB. User-approved voice unchanged.

## Data, lineage, owner workflow

- Canonical production Top 10 audit passed all fixture/competition/home/away/kickoff checks.
  Fortaleza–Athletic Club is mapped to canonical Brasileirão Série B, kickoff 2026-09-27 21:30 UTC.
- Commercial player media inventory: zero approved assets. Real Player Clash/Star Focus remain
  dormant; original Liva characters do not bypass real-player rights gates.
- Owner queue exposes family, scenery, original-character identity/pose, palettes, voice/degradation,
  hook/CTA choice, promo variant, rendering duration and size. Existing actions and tracking remain.
- Owner-only `preview` action renders a single real video without writing a draft or generation job.
  This permits actual Preview runtime/audio QA without changing the production queue.
- Migration 037 only adds `growth_platform_assets.render_metadata` and a derived creative-history view.
  Validated against production in an explicit rolled-back transaction. Legacy reads tolerate the
  additive column not existing yet during rollout. It is not applied merely by a preview/build.
- Safe regeneration locks review records and rechecks eligibility after rendering. Concurrent approval
  cannot be discarded; carried platform statuses are reread under lock. A failed replacement render
  leaves its predecessor active. APPROVED/PUBLISHED are excluded from bulk regeneration.

## Gates and evidence

Initial real-data run: 15/15 successful narrated MP4s, 1080×1920 H.264/AAC; all 75 scene timings fit.
Four 15-panel contact sheets reviewed (hook, matchup, context, CTA). No primary clipping or nameplate
overlap found after fixes. Initial larger files were rejected for release; final size-cap QA is required.
Audio peak checks: -3.0 to -3.9 dBFS, no clipping. Owner accepted voice delivery.

Typecheck, zero-warning lint, secret scan, production build passed during implementation.
Bundle tracing includes all ten character PNGs and both scenery PNGs in the render routes.
Final full suite: Node 17/17; Vitest 1344 passed, one pre-existing scheduler simulation timeout.
The identical test at line 72 in `src/odds/scheduler-policy.test.ts` is unchanged. Fresh isolated
production-baseline run: 1321 passed and the same 5s timeout (10.86s execution). Tests/timeouts were
not weakened. Focused growth: 69 tests plus all six real renderer tests passed.

## Release checklist

### Production runtime follow-up

PR #9 deployed as a7178b33d555b2365e692ae5f3eb8c3dea347bf8; additive migration 037 applied.
The real 22:17 UTC cron successfully produced 3 packages / 9 fully voiced videos in 243.25s.
A subsequent controlled 3-fixture run reached the 250s rendering guard on its final Shorts asset.
The process returned PARTIAL safely instead of exceeding the 300s function ceiling.

The scheduled batch is therefore reduced to **2 fixtures**, retaining Top 5 / Top 10 selection,
scoring, three daily schedule times and duplicate prevention. Premium repair also includes active,
all-DRAFT items with a failed/degraded asset; it retains the same locking and immutable predecessor
lineage. No approved/published item is eligible. This is a measured runtime correction, not a redesign.

### Deployed Preview findings

An isolated, owner-authorized same-commit Preview was used without persisting drafts. Preview lacked
both owner credentials and AUTH_SECRET; short-lived branch-only values were created, then removed.
All temporary deployments and Vercel automation bypasses were deleted/revoked after every test.
Production owner credential IDs and update timestamps remained unchanged.

Three real Vercel renders passed encoding/narration (25.5–27.7s each, 2.25–3.51 MB, five voiced scenes),
but visual inspection correctly blocked release: the fontless Linux runtime rendered missing-glyph
boxes instead of headlines. The local Windows render did not reveal this environment defect.

Liberation Sans 2.1.5 and its SIL OFL license are now bundled in both render routes, with Fontconfig
aliases preserving the existing Arial-compatible metrics and visual hierarchy. A runtime glyph check
fails before narration if text is missing. Owner-only failure diagnostics expose bounded machine codes,
never raw exceptions, SQL or credentials. Corrected deployed visual QA is required before merge.

Before merge: final payload-constrained Top 5 × 3, focused gates, exact commit Preview, three
owner-only deployed render proofs, owner UI and static asset checks. After merge: exact production
deployment/alias SHA, additive 037, controlled generation, eligible DRAFT regeneration and retained
lineage, current Top 5 outputs, scheduler and public funnel checks.

No auto-publishing is implemented. V2 TikTok/Reels/Shorts account connections, publishing permissions,
publication workers, retry/idempotency, platform receipt capture and publishing feedback remain deferred.
