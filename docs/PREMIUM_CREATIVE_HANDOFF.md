# Traffic Engine V1.2 — Premium Creative: handoff to Codex

> Historical checkpoint below. The continuation and current release evidence are recorded in
> [PREMIUM_CREATIVE_RELEASE.md](PREMIUM_CREATIVE_RELEASE.md). The supplied character pack has now
> been integrated; do not interpret the historical "artwork absent" status as the current code state.

**This is a work-in-progress checkpoint, not a release.** Nothing on this branch has been merged or
deployed. Production is untouched and still serves the V1.1 baseline.

## Branch and SHAs

| | |
|---|---|
| Branch | `feat/premium-creative` |
| Production baseline we branched from | `b22df964c4daa46ba46adbf6374fc38039b4fecc` (`main`, live) |
| Checkpoint SHA | see `git log -1 feat/premium-creative` — pushed to `origin` |

### Commits on this branch

1. `a9ffaa6778dc0278c501ff02a9df08fa9cc5811c` — `fix(growth): fill the shortlist quota when diversity cannot`
   A verified pre-existing defect found during preflight, fixed before any creative work. The
   per-competition cap was a hard veto while filling and the override could only *replace* an entry,
   never add one, so a light calendar returned a short list — production had `top_social` at 4 of 5, and
   a single-competition window collapsed the Top 10 to 4. The selector now relaxes the cap one step at a
   time. No weight, score, tier or override threshold changed; today's live Top 10 reproduces exactly.
2. `8ba63e1` — `feat(growth): govern brand identity and narrate in Brazilian Portuguese`
3. Checkpoint commit — this document plus the in-progress creative system.

## Files and modules

**New**

| File | State |
|---|---|
| `src/growth/brand.tsx` | **Done.** Governed `LivaSports.com` / `PlayLiva.com` lockups, SVG + Satori forms. |
| `src/growth/voice.ts` | **Done.** ElevenLabs provider boundary, narration budgeting, caching. |
| `src/growth/scenery.ts` | **Built and wired, not visually re-verified.** Five background families + deterministic picker. |
| `src/growth/palette.ts` | **Done.** Club colour inspiration + neutral deterministic fallback. |
| `src/growth/characters.ts` | **Architecture only.** Artwork intentionally absent — see below. |

**Modified**

| File | Change |
|---|---|
| `src/growth/video-renderer.ts` | Scenery wired in, brand lockup in header, one brand accent, new matchup composition, narration mux (AAC), `-t` bound. |
| `src/growth/platform-content.ts` | Rank-offset variant seeding, expanded hook pools (≥6 each), new `TABLE_LINES` / `STORY_LINES` pools, `.com` in public CTA copy. |
| `src/growth/config.ts` | `VOICE` block (model, budgets, gains, pinned voices), `CHANNEL_VOICE`. |
| `src/growth/content.ts` | Threads `rank` into `platformDrafts`. |
| `src/growth/voice.ts` | Pinned voice resolution (no `voices_read` needed). |
| `src/growth/shortlist.ts`, `shortlist.test.ts` | The quota fix (commit 1). |
| `src/growth/video-renderer.test.ts` | Three new narration-mux tests. |

## ElevenLabs integration status

**Working and proven in real output.** Do not re-architect it.

* The supplied key is **valid but scoped**: it carries `text_to_speech` but **not** `voices_read` or
  `user_read`. The first implementation auto-discovered voices via `GET /v1/voices` and 401'd. Fixed by
  pinning voice ids — the library is never listed, so the missing scope is irrelevant.
* Model `eleven_multilingual_v2`, `language_code: pt`, output `mp3_44100_128`.
* Narration is laid against the scene plan (`GrowthVideoScene.voiceover` + `startSeconds`) with
  `adelay`, mixed under FFmpeg-generated pink-noise ambience through `alimiter` (no licensed audio
  anywhere), encoded AAC 128k stereo.
* One synthesis cache is shared across a fixture's three platform renders, so a line the platforms word
  identically is produced once instead of three times. A test enforces this.
* Per-request timeout, a per-video wall-clock budget, and a size bound. Exceeding the budget degrades to
  the lines already produced rather than risking the serverless limit.
* With no credential configured the provider is explicitly unavailable and the render is silent but
  fully captioned — CI, preview and local runs are unaffected.

### Voice configuration (no secrets here)

| Mode | Used by | Pinned voice id | Override env var |
|---|---|---|---|
| `ENERGETIC` | TikTok | `TxGEqnHWrfWFTfGW9XjX` | `ELEVENLABS_VOICE_ENERGETIC` |
| `EDITORIAL` | Reels, Shorts | `onwK4e9ZLuTAKqWW03F9` | `ELEVENLABS_VOICE_EDITORIAL` |

These are ElevenLabs premade voices, addressable by any account. They are **English-native voices
speaking Portuguese** — accent has not been judged by ear. Eight candidates were auditioned and all
produced audio. **Recommended next step: listen, then override with a Brazilian voice id from the
account's own library.** No code change is required to switch.

**Credential handling.** `ELEVENLABS_API_KEY` is read from `process.env` at call time only. It is never
logged, returned, embedded in an asset or written to the database. Locally it lives in `.env.local`
(git-ignored, untracked). **It is NOT configured in Vercel** — Preview and Production still need it
added by the owner. The key was pasted into a chat transcript, so **it should be rotated**: create a
fresh key scoped to `text_to_speech` only, add that one to Vercel, revoke the old one.

## Real Top-5 render results

Run against live production ranking with real narration (`pnpm run growth:render-top5`):

| | |
|---|---|
| Videos | **15 / 15**, zero failures |
| Audio track | **15 / 15** carry PT-BR narration (AAC verified in every container) |
| Size | 1.3 – 3.0 MB (cap 8 MB) |
| Wall clock | 4m52s for 5 fixtures × 3 platforms |

### Runtime measurements

* **58s per fixture** (three platform encodes + narration).
* Production renders `generationBatchSize: 3`, so a scheduled run is **≈175s against the 300s Vercel
  limit** — inside it, but a tighter margin than V1.1's silent renders.
* Sequential encoding, bounded batches, crest caching and the single-encoder memory strategy are all
  **unchanged**. Narration adds roughly one network round trip per distinct line, deduped across
  platforms.
* **These numbers predate the scenery wiring.** Re-measure after the next render: richer backgrounds
  add rasterisation cost per scene.

## Visual QA findings (from the real Top-5 contact sheets)

**Confirmed working in production-like output**

* `LivaSports.com` with the real owned mark appears on **every one of the 15 frames**.
* The old off-brand channel accents (lime `#d5ff48`, pink `#ff4fb8`, red `#ff365f`) are gone; brand
  green `#24d39b` throughout.
* The three platforms are genuinely distinguishable (headline treatment, card style, `RESUMO` badge).

**Still to fix — these were the reasons the milestone was not declared done**

1. **Copy repetition.** Before the fix, `…chega no G4 — e esse jogo vale posição na parte de cima`
   appeared on 3 of 5 fixtures and `Jogo para colocar no radar desta rodada` on the other 2 — all five
   sharing two sentences. Root cause: `storyLead()` returned one fixed sentence per story angle, and
   variant seeding ignored rank so same-angle fixtures collided. **Fixed in code but NOT yet re-rendered
   or verified.**
2. **Empty middle.** The old layout floated two 300px badges high on the canvas leaving a ~380px dead
   band above the caption box. **New composition written but NOT yet visually verified.**
3. **Magenta Reels background** (`#100b20 → #29142f`). **Replaced by the scenery system, NOT verified.**

## Component status

| Component | Status |
|---|---|
| **Brand lockup** | **Done and proven live.** Real owned marks, real palettes, `.com` always present, one governed module used by both renderers. |
| **PlayLiva cross-promo** | **Partial.** `PlayLivaLockup` / `playLivaLockupSvg` exist and render correctly (verified). The **end-card component and its 2–3 variants are NOT built** and are not in any scene yet. |
| **Scenery** | Five families written (`STADIUM_NIGHT`, `PITCH_MATCHDAY`, `TUNNEL_BIGMATCH`, `EDITORIAL_SPORTS`, `CHARACTER_WORLD`) and wired into `sceneSvg`. **Not visually re-verified after wiring.** A known weakness: an early proof showed the crowd reading as dotted lines and pitch stripes being effectively invisible (`pitchStripes` opacity/curve needs work). |
| **Team identity / composition** | New 396px crest plates, nameplates with long-name safety, versus medallion, context strip. **Written, typechecks, not visually verified.** |
| **Copy variety** | Pools expanded to ≥6 per hook family; new `TABLE_LINES` and `STORY_LINES` pools; rank-offset seeding. **Not yet verified against a real Top 5.** |
| **Voiceover** | **Done and proven.** |
| **Owner queue metadata** | **Not started.** `RenderedGrowthVideo.voice` now carries `{mode, provider, lines, degradedReason}` but nothing surfaces it in the owner UI yet. |
| **Creative history / variety persistence** | **Not started.** No migration, no recent-template tracking. |
| **DRAFT regeneration** | **Not started.** |

## Character system — approved external art direction

The Product Owner has **approved a new external original-character art direction**. Final character
assets will be supplied to Codex separately.

* `src/growth/characters.ts` contains **architecture only**: `CharacterPose`, `CharacterOptions`,
  `clashPoses()` rotation, `characterDefs()`, and `characterAssetsAvailable()` / `renderCharacter()`
  stubs. `src/growth/palette.ts` provides the club-colour tinting and the deterministic neutral
  fallback for unknown clubs.
* A first attempt hand-drew the figures as SVG geometry in code. The result was judged below
  publishable quality and **was deliberately not committed**. **Do not spend time hand-drawing mannequin
  SVGs.**
* `characterAssetsAvailable()` returns `false`, `pickScenery()` never selects `CHARACTER_WORLD`, and
  every fixture falls back to the crest / stadium / tunnel / editorial treatments. Character mode is
  present but dormant and fallback-safe.
* **When assets arrive:** implement `renderCharacter()` to draw the supplied artwork using the pose and
  palette already resolved, and flip `characterAssetsAvailable()`. That is an asset swap — do not
  redesign the architecture.

## Must NOT be shipped yet

* **Nothing on this branch is release-ready.** No merge, no deploy.
* The scenery, composition and copy changes are **unverified visually**. Per the milestone's own
  acceptance bar, they must not be merged on green tests alone.
* The crude mannequin artwork must never reach production.
* Vercel still has no `ELEVENLABS_API_KEY`, so a Preview deploy would render silent.

## Exact next steps for Codex

1. **Re-render the real Top 5** (`pnpm run growth:render-top5`) and regenerate all three contact sheets
   (hook, matchup/context, CTA). Compare against the previous sheets.
2. **Judge the output honestly** against "would a serious football betting/media brand publish this?".
   Expect to iterate on `scenery.ts` — `pitchStripes` and `crowd` are known weak.
3. **Verify the copy fix worked**: confirm the Top 5 no longer share one or two sentences.
4. **Re-measure runtime and memory** after scenery — the 300s limit margin has shrunk.
5. **Build the PlayLiva.com end card** (2–3 variants) and place it on the CTA scene, clearly secondary.
6. **Listen to the narration** and override the voice ids with a Brazilian voice if the accent is wrong.
7. **Surface voice/creative metadata in the owner queue** (voice mode, scenery family, character mode,
   degraded reason).
8. **Creative history persistence** — migration + recent-template/hook/CTA tracking for variety.
9. **DRAFT regeneration** of safely eligible existing drafts, preserving lineage; never touch
   `APPROVED` / `PUBLISHED`.
10. **Add the regression tests** listed in the milestone brief (§25) — brand lockup invariants, `.com`
    never missing, long team names, scenery selection, platform differentiation, caption timing, audio
    muxing, MP4 dimensions/size, runtime guards.
11. Only then: PR → Preview → visual/audio QA → merge → production → controlled generation.

## Environment notes

* Node **v24.21.0** (matches Vercel's `24.x`), pnpm **10.20.0**, install with `--frozen-lockfile`.
* `src/growth/cli.ts` is the only sanctioned entry point for growth scripts; `scripts/growth-cli-preload.mjs`
  refuses to load for anything else, so ad-hoc imports of growth modules will fail.
* One **pre-existing, environment-only** test failure is expected on a slow machine:
  `src/odds/scheduler-policy.test.ts > budgets all forty-four feeds…` exceeds vitest's 5s default. It was
  reproduced on the untouched baseline `44ba067`. **Do not "fix" it or weaken the test.**
