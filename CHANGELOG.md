# Changelog

All notable changes to `@bizrnr/blog-engine`. Consumers install from git, so
the version in `package.json` is the contract marker.

## 0.3.0 — 2026-08-22

Portability + audit release: the engine runs on any stack for any website,
dependencies are current, and the contract is re-aligned with the ASEO skill.
(The portability work landed on `main` ahead of the version bump; both halves
ship together as 0.3.0.)

### Added — audit release (2026-08-22)
- `identity.author` → `author:` frontmatter and default BlogPosting author
  entity (E-E-A-T).
- `topics.ownerPages` → prompt guidance to support, never compete with, the
  site's canonical owner pages (one owner per query family).
- `content.maxPostsPerWeek` cadence guard (`skipped: 'CADENCE_CAP'`).
- Hero `width`/`height` recorded into frontmatter (`imageWidth`/`imageHeight`)
  and parsed back (`heroImageWidth`/`heroImageHeight`); schema emits an
  `ImageObject` when known.
- `speakableSelectors` option on schema builders.
- `src/discovery.ts`: `blogSitemapEntries()` and `buildBlogLlmsTxt()`.
- `countPostsSince()` exported; `ExistingPost.date`.
- `docs/AUDIT-2026-08.md`, `docs/ROADMAP.md`.

### Changed — audit release
- Citable blockquote target 120–160 words (validator 50–220) to align with the
  ASEO skill's ~134–167-word citable passage guidance.
- Dependencies: `ai` 6→7 (`generateImage` stable name), `@ai-sdk/gateway` 3→4,
  `sharp` 0.34→0.35 (fixes libvips CVE-2026-33327/33328/35590/35591),
  `typescript` 5.9→6.0, `@types/node` 20→22, `tsx` latest; `engines.node >= 20.9`.
- Workflow builders and CI emit `actions/checkout@v7`, `actions/setup-node@v7`,
  `peter-evans/create-pull-request@v8`.
- `RenderMarkdownArgs` gains optional `author`. All new fields optional.

### Added — portability
- **Provider seams.** `hooks.fetchGscQueries` and `hooks.submitSitemap` let a
  site use its own Search Console auth (a service-account JWT, for example) or
  any other demand source; rows still pass through the engine's own filters.
  `hooks.renderMarkdown` lets a site own its frontmatter shape while the engine
  keeps generation, validation, watermarking, encoding and the write.
- **Optional Open Graph card** via `image.og.enabled` (default `true`). With it
  off, the hero doubles as the OG image and is reported as `ogImage`.
- **Adapter validation.** `configureBlogEngine` now validates the runtime and
  throws one error listing every problem, each naming the config path.
  `validateBlogEngineRuntime` is exported for linting an adapter in CI.
- **`content` rules for voice and law:** `tone`, `ctaInstruction`,
  `crossPromoInstruction`, and `extraRules` (verbatim extra hard rules — the
  seam for domain-specific editorial law).
- **`examples/minimal`** — the smallest complete adapter, for a business with
  no voice agent, partner site, licence or service areas. Covered by tests.
- `identity.ctaPath` for sites without a voice agent.

### Fixed — portability
- **GSC-driven topics were broken for every site that did not define
  `topics.categoryForQuery`.** The default returned real-estate categories
  (`Buying`/`Selling`/`Neighborhoods`), which fail `allowedCategories`
  validation on all three attempts and throw. It now returns the site's own
  first allowed category.
- Empty `heroPhotos` / `gradients` / `editorial` / `allowedCategories` crashed
  with an undefined read deep in the pipeline; they are now rejected at config
  time with an actionable message.
- A dry run no longer creates the content directory.
- The OG card footer no longer renders `undefined` when an identity has no
  title or licence.

### Changed — portability (behaviour, backward compatible)
- `identity.agent.title` / `titleCap` / `license` / `since`, `identity.areas`,
  `identity.voice` and `identity.backlink` are now **optional**. With no voice
  the engine writes a plain CTA to `identity.ctaPath`; with no backlink it
  skips cross-promo posts instead of inventing an outbound link.
- Vendor/product copy ("no contact forms", "speak with <voice> by voice", the
  AI-receptionist cross-promo framing) moved out of the core prompt and into
  `examples/sdbg`, whose output is unchanged.
- `identity.voice.valuationPath` renamed to `secondaryCtaPath`.

## 0.2.0 — 2026-07-18

ASEO content contract, `openai-compatible` text provider, `generateText` /
`generateHeroImage` hooks, `src/schema.ts` JSON-LD builders, RSS enclosures
with real byte lengths.

## 0.1.0 — 2026-07-02

Initial canonical engine: GSC-informed topic rotation, OpenRouter generation,
Vercel AI Gateway heroes, Sharp watermarking, branded OG cards, Markdown +
RSS, IndexNow/GSC pings, PR-safe workflow builders, template runtime.
