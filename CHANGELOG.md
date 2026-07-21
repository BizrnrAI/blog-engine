# Changelog

## 0.3.0

Portability release: the engine now runs on any stack, for any website.

### Added
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

### Fixed
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

### Changed (behaviour, backward compatible)
- `identity.agent.title` / `titleCap` / `license` / `since`, `identity.areas`,
  `identity.voice` and `identity.backlink` are now **optional**. With no voice
  the engine writes a plain CTA to `identity.ctaPath`; with no backlink it
  skips cross-promo posts instead of inventing an outbound link.
- Vendor/product copy ("no contact forms", "speak with <voice> by voice", the
  AI-receptionist cross-promo framing) moved out of the core prompt and into
  `examples/sdbg`, whose output is unchanged.
- `identity.voice.valuationPath` renamed to `secondaryCtaPath`.

## 0.2.0

ASEO content contract, `openai-compatible` text provider, `generateText` /
`generateHeroImage` hooks, `src/schema.ts` JSON-LD builders, RSS enclosures
with real byte lengths.
