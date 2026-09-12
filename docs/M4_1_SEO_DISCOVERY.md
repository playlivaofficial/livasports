# LivaSports M4.1 — SEO and Discovery

## Search-facing pages

Team and player profile pages render their useful primary content on the server. Metadata is generated from persisted identity and real modules only.

Examples of localized title patterns:

- PT-BR team: `Flamengo: jogos, elenco e estatísticas | LivaSports`
- ES-MX team: `América: partidos, plantilla y estadísticas | LivaSports`
- PT-BR player: `Agustín Rossi: estatísticas, jogos e perfil | LivaSports`
- ES-MX player: `Luis Malagón: estadísticas, partidos y perfil | LivaSports`

Every eligible page includes:

- canonical URL;
- PT-BR and ES-MX `hreflang` alternates for the same canonical entity;
- natural localized description;
- real last-modified source timestamp;
- `SportsTeam` or `Person` JSON-LD using only stored properties;
- `BreadcrumbList` JSON-LD;
- Open Graph identity and a provider image only when available.

No biography paragraphs, `sameAs` links, social identities, or unsupported rich-result promises are fabricated.

## Indexability policy

Team pages are indexable when persisted matches, squad membership, or known team statistics make the page useful.

Player pages are indexable when a current persisted team context exists and the page has season statistics or a real linked match log. A lineup-only name with no biography/context remains usable through internal links but receives `noindex,follow` rather than entering the sitemap as thin content. Provider-error-only and unknown pages are not indexed.

## Sitemap

The dynamic sitemap reads Neon only and never calls Sportmonks or OddsPapi. It emits paired PT-BR/ES-MX canonical URLs for eligible matches, teams, and players with language alternates. Public IDs keep sitemap identity stable across display-name changes.

## Internal discovery graph

```text
Fixture list -> Match Center -> Team -> Squad player -> Player -> Match Center
                             -> Player event/stat links
                             -> Standings team links
```

Links are real semantic anchors. The global competition navigation is not expanded into a 1,000-team SEO directory, and no invisible link block is created.

## Verified behavior

- stale team/player slugs redirect with HTTP 308;
- malformed and unknown IDs return HTTP 404 and `noindex` output;
- locale switching preserves canonical entity identity;
- accented/long names generate readable slugs without controlling identity;
- two same-name player groups remain separate;
- disabled/thin profiles are excluded by the persisted sitemap query;
- sitemap generation makes zero provider requests.
