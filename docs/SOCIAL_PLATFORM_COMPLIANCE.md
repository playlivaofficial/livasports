# Social platform compliance

## Scope and operational boundary

`SOCIAL_V2` derives ONE 1080×1920 master MP4 at 18fps, ONE 1080×1920 story PNG, and ONE 1080×1350 feed PNG per Social Top 5 fixture. TikTok Safe, Instagram Reels and YouTube Shorts share the strict editorial narrative and media. Titles, captions, hashtags/CTA metadata and posting states remain independently validated. Existing Instagram master geometry, branding, original artwork, scene motion and audio design are retained. The shared spoken hook/CTA use the conservative TikTok editorial copy; platform-specific posting copy does not trigger separate video encodes. The gambling comparison panel becomes a genuine stored form/standings card; if neither is present it uses competition/kickoff facts. H2H and injuries are not invented.

No changes to public sports pages, bookmaker source truth, GEO/affiliate gates, provider schedules, SEO rankings, acquisition UTMs or Top 10/Top 5 selection. Generation remains under the existing lease, invocation deadline and batch limit. Exactly one call to `renderCanonicalPackage` produces the three canonical assets; it calls the video encoder once. Shared asset and durable narration caches avoid repeated fetches/synthesis. Missing statics can be repaired without repurchasing voice or encoding a video, and only when their hashes match the stored proofs. Invalid same-identity packages fail closed rather than causing repeated paid retries. Pending work waits for a later existing invocation; no deadline or cadence was expanded. A narration failure preserves the predecessor but does not certify its old generic content.

## Policy and certification

`src/growth/socialCompliance.ts` is the central policy/copy layer. TikTok is permanently strict in this release. Instagram's `instagramAllowBettingContext` is false; approved account/GEO records are empty. YouTube destinations are not certified. Consequently **all three generators stay editorial**. Enabling a boolean alone does not unlock gambling content. Approved commercial integration is deliberately not implemented or inferred; adding it requires account/GEO permission evidence, destination certification where applicable and a separately reviewed policy change. TikTok never falls back to it.

Official policy references reviewed 2026-09-28:

- [TikTok regulated commercial activities](https://www.tiktok.com/community-guidelines/en/regulated-commercial-activities/): gambling facilitation/marketing restrictions. An account's previous warning makes conservative treatment especially important.
- [Instagram Community Guidelines](https://www.facebook.com/help/477434105621119?locale=en_GB): online gambling promotion requires prior written permission. No such permission was verified here.
- [YouTube illegal or regulated goods/services policy](https://support.google.com/youtube/answer/9229611?hl=en): uncertified gambling access, external/verbal directions and guaranteed returns are restricted; some gambling content can be age-restricted.

Internal `ready` means the deterministic content checks passed, **not** platform approval, legal advice, age eligibility or a guarantee against enforcement. The owner should review the complete asset and destination, especially for the first-warning TikTok account. Logos/artwork reuse is restricted to the existing original art and team-crest source; text scanning is not general OCR of arbitrary uploaded media. Unknown assets/templates are blocked.

## Fail-closed enforcement

- Normalize accents, numeric HTML entities, URI encoding and zero-width characters.
- Inspect headlines, rendered SVG text, subtitles, actual normalized narration text, scripts, captions, hashtags, CTA, cover, alt text and export metadata.
- Block restricted terminology, operators, inducements, promotional codes, guaranteed returns, unknown/external URLs, odds panels and unreviewed assets. Only canonical LivaSports match links/UTMs and the displayed brand domain are allowed.
- Return `blocked_for_review` with reason codes when evidence/model is missing or content is unsafe.
- Validate all drafts before narration, validate actual scene layers, bind three policy proofs to each exact posting draft plus the SAME video/story/feed SHA-256 values. Rendered scene/subtitle/artwork identity must be common across all three profiles.
- Persist all three assets atomically, validate their hashes before insertion, and recheck the proof on manual copy/post/download paths.
- Older generic master packages remain in history but cannot be exported as policy-verified. Omitting `current=1` does not bypass verification. The legacy image endpoint redirects only to a verified platform cover; the old master is never a fallback.
- No social-network publishing API is called. Existing manual posting remains manual.

## Data and migration

`050_social_platform_compliance.sql` is additive/idempotent: a unique SOCIAL_V2 fixture/creative/content identity index using `IF NOT EXISTS`. No per-platform video or cover columns are added. Proofs are stored in the existing canonical master `render_metadata.socialProofs` JSON field; the existing `(content_item_id,kind)` uniqueness enforces one of each canonical asset. It does not rewrite/delete historical content. **Not applied to production in this task.** Apply through the existing migration mechanism before releasing the new generator. Reads of an unmigrated schema remain unverified; there is no silent certification of old bytes.

`socialSource` retains fixture, teams, competition, locale, standings/form, explicit null H2H, private markets/operators, target GEO and timestamp. Only an allowlisted editorial projection enters export metadata. Policy changes require a policy version and creative-stack revision bump. The current creative revision is 3.

## Samples and repeatable QA

Run locally from this checkout:

```text
node --import ./scripts/social-policy-qa-preload.mjs --import tsx scripts/social-policy-qa.ts <private-env-file>
pnpm test -- --maxWorkers=2
pnpm typecheck
pnpm lint
pnpm build
pnpm secret:scan
```

The sample runner reads only the explicitly selected São Paulo vs Santos fixture and stored facts. Local evidence is ignored under `output/social-policy/master/`. Default execution renders scene previews and the two statics without narration. `--narrated` generates ONE all-or-nothing canonical package, capped at the number of master scenes (five in this sample). `--vercel-voice` loads only the existing narration credential into memory; no env file is exported. A local ignored clip cache prevents repurchasing speech during recovery, and an existing completed master refuses automatic regeneration.

One common voice track serves all platforms. Burned-in subtitles are derived by the same `spokenLine` normalization used before synthesis (numbers, dates and brand pronunciation), rather than a separate summary. Form summaries are split into one scene per team to remain under the existing ten-second speech-per-scene limit; no claims or stats are added.

### Controlled narrated sample — 2026-09-28

- Fixture: `4f0d5109-2b7a-4e15-9b8b-06eef94b52e0`, São Paulo vs Santos, 2 October 2026, 20:00 Brasília.
- Current read-only database evidence: São Paulo 2W/1D/2L; Santos 4W/0D/1L, five recorded matches each.
- Six SELECTs for fixture enrichment, zero sports-provider requests, zero production writes.
- Five narration requests / 292 characters, complete 5/5 clips, no degraded reason.
- One master: SHA-256 `70eb04107d4201060ca26848d2631b0a500116d8b97c356272d4f0199157f8c9`.
- 1080×1920, 18fps, 570 decoded frames, 31.667 seconds, STABLE_MOTION_2.
- Actual encoded audio measurement: -15.12 LUFS, -1.52 dBTP, 3.70 LU loudness range. Not silent and no measured peak clipping.
- All five speech clip windows fit their scene windows. Encoded contact sheet and transition frames inspected: readable text, intact crests, no odds/operator/affiliate panels or clipped text.
- Story 1080×1920; feed 1080×1350. Dedicated layouts inspected, not stretched screenshots.
- Three distinct posting captions bind to the same video/story/feed hashes.
- **Audible QA approved by the owner on 2026-09-28.** The owner listened to the São Paulo–Santos master and confirmed that narration is acceptable and matches the intended subtitles/copy. This is human listening evidence, not an automated transcription claim. The earlier transcription request was rejected HTTP 401; it was not retried.
- **Release authorized:** the audible-review hold is resolved. Pre-release read-only preflight confirms migration 049 latest, 150 historical items, zero SOCIAL_V2 items, zero conflicting index groups. Migration 050 and production acceptance follow the normal release flow below.
- Production owner workflow/compliance acceptance must follow the eventual release; it is not yet marked PASS.

### Release continuation

1. Completed: owner listened to `output/social-policy/master/master_video.mp4` against the intended copy and approved audible QA. Preserve this approved sample; do not regenerate it unnecessarily.
2. Run final full test/typecheck/lint/build/secret gates and review the final diff.
3. Fetch and reconcile latest main safely. Apply only pending migration 050 through `src/database/migrate.ts`, after checking no unrelated migration is pending. Re-run the migrator to verify no pending migration.
4. Commit/push this feature branch, follow repository merge workflow, deploy the exact approved main SHA only to the existing LivaSports Vercel project.
5. Verify production owner queue: SEO 10/social 5, one master plus two statics, three distinct copy/post states, shared download hashes, legacy unsafe exports blocked, anonymous routes 401. Do not publish to social platforms.
6. Record deployment SHA/ID and migration/production evidence. Internal readiness remains explicitly distinct from platform approval.

Coverage includes prohibited phrases on every surface, metadata/URL leakage, unsupported claims, actual SVG text, no odds panels, voice failure, proof mutation, legacy download guards, a single encoder invocation, shared media hashes, independent posting states, durable cache/recovery, lease/duplicate prevention and unchanged Top 5 generation bounds.

### Final gates and unchanged production

2026-09-28 final gates: 1,618 Vitest tests / 197 files plus 17 Node validation tests = **1,635 PASS**. Typecheck, lint, production build, secret scan and diff whitespace checks PASS. Secret scan: zero exposed credential values, zero client secret references, zero tracked/unignored environment files.

Read-only Vercel verification: production remains `31e06f92c04191ff6ea42a356371bd5672044900`, deployment `dpl_4B4znpn1i5jynd7MizGC8xgajj9C`, READY. Public health returned 200 with the same release commit. Existing owner SEO page remains accessible and reports provider requests 0. This is baseline verification, **not** acceptance of the undeployed compliance candidate.

Candidate is released from `codex/social-platform-compliance` through a reviewed PR after the gates above. The baseline verification is not substituted for post-deployment acceptance. Deployment and controlled-generation evidence is recorded separately under ignored `output/social-policy/` and in the release handoff; no social auto-publishing is introduced.

### Production roundtrip correction

Migration 050 was applied through the normal migrator; a second pass applied nothing and the unique index is valid. PR #21 deployed the initial candidate. One owner-triggered production batch completed successfully with five packages in 144 seconds, zero sports-provider requests and no publishing. Production QA caught JSONB object-key reordering invalidating a byte-order-sensitive draft proof comparison. The follow-up makes proof encoding deterministic and compares existing proofs by their complete parsed JSON content: array order, text, values and asset hashes remain enforced. No database rewrite, recertification, extra voice synthesis or video rendering is needed. Regression tests cover recursive JSONB key reordering, legacy proof encoding, changed content, scene order and malformed proofs. Internal validation remains risk reduction, never platform approval.

