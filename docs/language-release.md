# Sports interface languages

The sports interface supports Portuguese (`/br`), Spanish (`/mx`) and English (`/en`). English includes fixture navigation, Match Center, team profiles and player profiles, using the existing stored sports data and visual system.

At `/`, a valid `livasports_language` preference takes priority. Otherwise the trusted Vercel country header selects Portuguese for Brazil, Spanish for Mexico and English elsewhere. Explicit localized URLs always remain in their requested language. Local environments default to English without trusting an arbitrary country header.

The header selector submits a same-origin POST to `/language`. It saves a one-year, HttpOnly, SameSite=Lax, first-party cookie (Secure on HTTPS). Recognized sports paths retain their public entity ID, query and section. Unsupported paths fall back to the selected home route; external redirects are not accepted. Full-document navigation also updates the document language. Keyboard users can dismiss the selector with Escape.

`InterfaceLocale` is separate from the existing BR/MX domain locale. Interface cookies never modify country headers, commercial eligibility, server configuration or stored sporting facts. English is a sports-only surface; existing BR/MX modules and canonical guest storage are retained. No provider ingestion, scheduler, odds, affiliate, campaign or migration behavior is added or changed by this release.

All index and entity pages have reciprocal Portuguese, Spanish and English alternatives, an English `x-default`, and localized canonical URLs. The sitemap includes all three copies and preserves stored last-modified dates. Production robots metadata advertises that sitemap.

## Verification

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` and `npm run secret:scan`.

With the built app running on port 3300:

```text
node --require ./scripts/tsx-windows-preload.cjs --import tsx --env-file=.env.local scripts/language-readonly-qa.ts before
node --require ./scripts/tsx-windows-preload.cjs --import tsx --env-file=.env.local scripts/language-http-qa.ts
node scripts/language-browser-qa.mjs
node scripts/language-accessibility-qa.mjs
node scripts/secret-scan.mjs --url=http://localhost:3300/en
node --require ./scripts/tsx-windows-preload.cjs --import tsx --env-file=.env.local scripts/language-readonly-qa.ts after
```

The HTTP and browser scripts also accept `https://livasports.com`. Browser QA uses an isolated profile, preserves storage through real language form submissions, blocks operator/provider requests, and never performs an outbound action. Database checks enforce read-only transactions and compare private configuration digests without printing their values. QA evidence stays in ignored output files.

This release does not complete or activate separate betting/commercial automation work.
