# Premium Motion, Natural Voice & Growth Intelligence (V1)

Builds on the Premium Creative release (`b3c42ea`). Publishing stays manual; nothing here posts to
TikTok, Instagram or YouTube.

## A. Natural PT-BR voice

- **Spoken-text layer** (`src/growth/spoken.ts`): captions are rewritten into what a Brazilian
  presenter says before synthesis: `sáb. · 27/09, 16:00` → "sábado, dia vinte e sete, às dezesseis
  horas"; `3º` → "terceiro"; `G4` → "gê quatro"; `A vs B` → "A contra B"; `LivaSports.com` → "Liva
  Sports ponto com"; state-suffixed club names are spoken as clubs (`Atlético-MG` → "Atlético
  Mineiro"). Long captions are split into spoken beats, and every line ends on terminal punctuation.
- **Continuity:** each line is synthesised with its neighbours as `previous_text`/`next_text` (the
  provider's own stitching mechanism) and a stable per-line `seed`.
- **Modes:** ENERGETIC (stability .40, style .40, speed 1.06, lead 0.08 s, tail 0.28 s, short beats,
  exclamation on the hook) vs EDITORIAL (stability .56, style .16, speed .97, lead 0.16 s, tail
  0.42 s, longer sentences). TikTok = ENERGETIC; Reels/Shorts = EDITORIAL.
- **Transitions:** 14 ms fade-in / 60 ms fade-out per clip. A line only starts once its scene has
  half-won the incoming transition and ends before the outgoing one begins, so a voice is never heard
  over the wrong picture.
- **Durable voice cache** (migration `038_growth_voice_clip_cache.sql`, additive): keyed by
  provider, voice, model, settings, spoken text, neighbours and seed. Unchanged lines are never paid
  for twice. Every store failure, including the migration not yet being applied, degrades to "not
  cached". `render_metadata.voice.cache` records memory hits, store hits, synthesized lines and
  billed characters.
- **Voice selection:** the pinned fallback voices are generic ElevenLabs premades, not Brazilian
  voices. `pnpm growth:voice-audition` auditions at most 4 PT-BR voices from the account on real
  LivaSports lines in both modes, within a hard 2,400-character budget printed before any request. It
  never prints the key. Set the chosen ids in `ELEVENLABS_VOICE_ENERGETIC` /
  `ELEVENLABS_VOICE_EDITORIAL`. `pnpm growth:verify` reports whether Brazilian voices are pinned.

## B. Motion language (`src/growth/motion.ts`, `motion-graph.ts`)

Scenes are split into depth layers: background camera (1.1× bleed), atmosphere, left/right/centre
heroes, headline and foreground. Each layer is rasterised once and animated only through FFmpeg
overlay positions, one background scale, built-in `xfade` transitions and a progress strip. Nothing
is evaluated per pixel: a custom per-pixel transition measured ~0.3 s per frame.

| | TikTok (PUNCH) | Reels (EDITORIAL_FLOW) | Shorts (INFORMATIONAL) |
|---|---|---|---|
| Transitions | match cut, whip, zoom-through, parallax | cross-dissolve, light sweep, parallax | pitch-line wipe, cross-dissolve, match cut |
| Transition length | 0.12–0.28 s | 0.30–0.50 s | 0.14–0.40 s |
| Camera | push 1.00→1.06–1.075, pan ±26 px, hook punch-in | push →1.045, pan ±34 px | push →1.025, no pan |
| Copy entrance | 0.2 s rise | 0.5 s fade/rise | on screen from the first frame |

- Heroes (crests or the approved Liva characters, never regenerated or deformed) enter from their
  side and drift toward each other (the matchup push). Centre pieces (odds columns, list rows, CTA
  steps) stagger in.
- Atmosphere per scenery family: floodlight sweep, haze, crowd flashes, tunnel glow, editorial
  lines or pitch glide. It is low-alpha and always behind the readable copy.
- The brand chrome and a continuous progress bar sit above every cut, so the film never "changes
  slide".
- The team separator is always **VS**: a medallion between the crests and a pill between the
  character nameplates. It is never `x`. SEO search-intent queries keep Brazilian search wording.

## C. Sound design (`src/growth/audio-design.ts`, `audio-mix.ts`)

- **Library:** `public/growth/audio/v1`, 13 files, 1.8 MB, produced by
  `scripts/growth-audio-generate.mjs`. Every file is original procedural synthesis: oscillators,
  filtered noise, Karplus–Strong strings, formant crowd babble and a small reverb. There are no
  samples, recordings, commercial songs or AI music services. Output is deterministic (verified
  byte-identical on re-run). Every file's SHA-256, origin and commercial licence is listed in
  `PROVENANCE.json` and checked by a test.
- **Music moods:** ENERGETIC (124 BPM), CINEMATIC_MATCH_NIGHT (92), PREMIUM_EDITORIAL (100),
  TENSION_BIG_MATCH (140).
- **Ambience:** CROWD_BED, STADIUM_LOW.
- **SFX:** kick impact, whoosh, transition sweep, light hit, sports impact, crowd swell, stadium
  rise. They are grouped in 3 kits (MATCHDAY / BROADCAST / CINEMATIC) mapped to transition cues.
- **Selection:** deterministic from platform, story angle, creative family, fixture, Top-5 rank and
  recent history. It is stored on the draft as `creative.audio` and never random.
- **Mix:** voice > music (−17/−19/−22 dB) > ambience (−24/−25/−28 dB). SFX sit at −12 to −17 dB.
  Beds are side-chain ducked by the voice bus (ratio 5, 25/350 ms). Loudness is two-pass, linear, to
  −15 LUFS with a −1.5 dBTP ceiling plus limiter. `render_metadata.audio` persists sources, hashes,
  gains, ducking and the measured output loudness and true peak.

## D. Frame rate: measured decision

All measurements are local renders (4 vCPU container, single-threaded FFmpeg as in production) of a
three-platform set with narration-length clips.

| Pipeline | Avg render / video | FFmpeg peak RSS | Size |
|---|---|---|---|
| Production baseline (static slides + zoompan, 12 fps, ultrafast) | 10.6 s | 981–1,047 MB | 2.4–3.3 MB |
| Motion, 12 fps, ultrafast | 11.0 s | 604–672 MB | 3.66–3.71 MB (at bitrate cap) |
| Motion, 15 fps, ultrafast | 12.0 s | 617–683 MB | 3.65–3.72 MB |
| Motion, 18 fps, ultrafast | 13.3 s | 620–690 MB | 3.66–3.71 MB |
| Motion, 12 fps, **superfast** | 11.6 s | 687–750 MB | 2.83–3.55 MB |
| **Motion, 15 fps, superfast (chosen)** | **12.7 s** | **695–767 MB** | **3.0–3.56 MB** |

- At the same size cap, `superfast` raised SSIM from 0.950 to 0.976 (+3.2 dB) for +0.8 s.
  `veryfast` reached 0.979 but cost +4.6 s.
- 15 fps adds ~1.1 s per video over 12 fps. It gives transitions 4–7 frames instead of 3–5 and a
  smoother camera.
- 18 fps adds a further ~1.4 s for a smaller perceptible gain.
- The Top 5 × 3 QA run averaged 12.2 s per video (11.3–13.5 s); each is 21–29 s long and
  2.8–3.6 MB.
- **Serverless headroom estimate:** the scheduler renders 2 fixtures (6 videos) per run against a
  250 s internal deadline. Scaling the recorded production figure (243 s for 3 fixtures) by the
  measured +20 % gives ≈195–205 s per run, leaving ~45–55 s. The runner already stops starting a
  fixture within 60 s of the deadline, and the durable voice cache removes synthesis time on
  re-renders.
- `render_metadata.stages` now records narration, layers, audio and encode time per render, so the
  real Vercel headroom is measured after deploy.
- **Fallback:** `VIDEO.fps` is a single config value. If production stages show less than 25 %
  headroom, set it to 12, which costs about 1.1 s per video less.

## F–H. Growth Dashboard & Weekly Scorecard

Owner-only (existing owner session), noindex, and no provider calls.

- `/owner/growth/dashboard`: overview with previous-period deltas, daily trends, strict funnel (by
  source), acquisition, top content with traffic / engagement / bookmaker-click winners, Traffic
  Engine performance (UTM → growth item → creative), SEO/organic, social, revenue (verified operator
  events only) and data quality.
- `/owner/growth/scorecard`: Monday–Sunday in São Paulo vs the prior week, with Top 5 landing pages
  and matches, top competitions and clubs, top social source, story angle and creative family. The
  Winners / Watchlist / Weak thresholds are shown on the page.
- `/api/owner/growth/dashboard/export`: CSV per table, plus the weekly snapshot as CSV and JSON.
  Cells are formula-injection safe.
- Only HUMAN sessions count, and an event counts only if its session is HUMAN. The redirect path
  labels owner clicks HUMAN; they are now classified OWNER at source and are also excluded by session
  for historical rows.
- Outbound clicks reconcile against the affiliate click ledger through the shared click UUID.
- Search Console and native TikTok/Reels/YouTube metrics are shown as **not connected**. They sit
  behind provider boundaries and are never estimated.
- `scripts/growth-dashboard-qa.ts` recomputes every headline number with independent SQL
  (read-only against any database). `--seed` builds a labelled synthetic dataset on a local database
  only.
