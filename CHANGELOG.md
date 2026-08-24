# Changelog

All notable changes to `@bizrnr/blog-engine`. Consumers install from git, so
the version in `package.json` is the contract marker.

## 0.7.0 — 2026-08-24

Publishing without GitHub: content becomes data.

### Added
- **`BlogStore` seam** (`src/store.ts`) — the engine's single route to persisted posts and
  assets. Cadence counting, topic dedup, refresh, the corpus audit, discovery and the scorecard
  all read through `listPosts()`; publishing goes through `putPost()` / `putAsset()`.
  `createFileStore()` is the default and reproduces previous behaviour exactly.
- **`createSupabaseStore()`** (`src/supabase-store.ts`) — posts as rows, assets in Storage,
  implemented with plain `fetch` against PostgREST and the Storage REST API. **No new
  dependency.** Upserts on `(site_id, slug)`; a refresh never moves `published_at`.
- **`sql/0001_blog_posts.sql`** — canonical schema for every site: one table partitioned by
  `site_id`, RLS limiting anonymous reads to published rows, indexes for the engine's hot paths,
  and a public `blog-assets` bucket.
- **`runBlogService(sites, options)`** (`src/service.ts`) — one process publishes for many
  sites, with per-site schedules (`days`), `enabled` pausing, `only` filtering, and failure
  isolation: one site's exception never stops the fleet. `formatServiceReport()` for logs.
- `auditPosts(posts)` — audit any source, not just the filesystem. `hasRemoteStore()`.
- `docs/SERVICE.md`.

### Changed
- `writeHeroVariants(root, ...)` takes the repo root and writes through the store (was an output
  directory). Hero, variants and the OG card all route through `putAsset`, so a remote store
  returns CDN URLs and nothing lands in `public/`.
- A store-backed run no longer creates the content directory on disk.
- The scorecard's cadence and corpus checks read the store.

### Compatibility
- Fully backward compatible: with no `hooks.store` the engine reads and writes Markdown exactly
  as before. `persistPost` still takes precedence over the store when both are set.

## 0.6.0 — 2026-08-24

Fleet-readiness release: the gaps that blocked whole classes of site from adopting the engine.

### Added
- **`hooks.persistPost({ post, cover, markdown, file, root, isRefresh })`** — store the finished
  post anywhere (Postgres, a CMS, object storage). Return `true` to ALSO write the Markdown file
  (dual-write during a migration); return `false`/void when the hook owns persistence. With no
  hook, behaviour is unchanged. Generation and refresh both route through it.
- **`paths.contentExtensions`** (default `['.md']`) — readers, the cadence guard, the corpus audit
  and refresh accept any configured extension (e.g. `['.mdx', '.md']`); generation writes the first.
  New exports `contentExtensions`, `isPostFile`, `slugFromFile`.

### Added — traffic playbook
- **Live probe in the scorecard**: fetches hub, feed, newest and oldest post plus
  `robots.txt`; fails on non-200 and on `answer-pre-js` when the quick answer is
  absent from the raw HTML (the only check that proves the citable passage is
  extractable at all).
- **Retrieval-crawler check**: `crawlerBlocked()` + `RETRIEVAL_CRAWLERS`
  (OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot, Claude-User,
  Google-Extended). A robots block is a scorecard failure.
- **`hooks.inspectUrl`** + fixed-cohort index coverage, so "not indexed" and
  "not checked" are distinguishable.
- **`blogHubSitemapEntry()`** — hub `lastmod` from the newest post.
- **One publishable predicate**: `excludeBlocked()` plus an `exclude` option on
  `blogSitemapEntries`, `buildBlogLlmsTxt`, `buildBlogRss` and `relatedPosts`,
  fed by `blockedSlugs(auditBlogCorpus(root))`.
- **Orphan detection** in the corpus audit (inbound internal links, applied once
  the corpus has 3+ posts).
- **`cannibalizationPairs()`** — one normalized query on 2+ URLs at ≥10
  impressions — surfaced by the scorecard.
- **`classifyQueryIntent()`** + `topics.intentForQuery` and opt-in
  `topics.preferVerificationIntent`.
- **`content.minDaysBetweenRefresh`** (default 45) — applied after both the
  demand-led and backlog selection paths; an explicit `--slugs` overrides it.
- Scorecard also reports striking-distance (position 11–20), review-queue age
  (fails >48h), and warns when `maxPostsPerWeek` is unset.

### Changed — content contract
- Citable blockquote target 134–167 words; validator floor raised 50 → 90.
- `answer` target 40–60 words (was 40–55).
- Prompt now asks for plainly stated limitations and forbids repeating the same
  distinctive keyword at both ends of the title.
- `classifyAction` returns `leave-alone` for a top-8 position with healthy CTR
  (was always `title-experiment`).
- Search Console windows use `dataState: 'final'` and end 3 days back, so
  period-over-period comparisons stop mixing partial days with final ones.

### Fixed
- **The Open Graph card no longer fails a run when the brand logo is missing or is an SVG.**
  `makeOgCard` rasterizes whatever the logo is (PNG/JPEG/SVG at 288 DPI) and falls back to a
  wordmark card when there is no readable logo — matching how watermarking already degrades.

## 0.5.2 — 2026-08-22

Adopter seams surfaced by the kristianpeter.com migration. All additive; defaults unchanged.

### Added
- **Frontmatter key aliases** (`src/frontmatter.ts`): `pubDate`→`date`, `publishDate`→`date`,
  `updatedDate`/`modifiedDate`→`updated`, `cover`/`heroImage`→`image`, `coverAlt`/`heroAlt`→`imageAlt`,
  `coverWidth`/`heroImageWidth`→`imageWidth` (and height), `readingTime "7 min"`→`readMins: 7`.
  Normalization is additive and canonical-first, so existing adapters are unaffected. A site that
  keeps its own shape now gets the cadence guard, corpus audit, scorecard, refresh cover/date and
  schema without mirroring its corpus into a temp directory.
  Extend with `paths.frontmatterAliases`; replace wholesale with `hooks.parseFrontmatter`
  (return null to fall back). New exports: `DEFAULT_FRONTMATTER_ALIASES`, `normalizeFrontmatter`,
  `resolveFrontmatterAliases`, `coerceFrontmatterValue`, `parsePostFile`;
  `parseBlogFrontmatter(raw, { aliases?, normalize? })`.
- **Topic pinning**: optional `slug`/`title` on `EditorialTopic` and `SeoTopic`. A pinned slug is used
  verbatim (no `slugify` stop-word stripping), a pinned title as-is; both are stated in the prompt
  and asserted by the validator. Pinned topics are matched EXACTLY for coverage instead of the
  two-distinctive-words heuristic, which false-positives on question-style titles.
- **`hooks.pickTopic({ existing, gscQueries, offset })`** (null = engine rotation) and
  **`hooks.deriveTopic({ existing })`** (invoked only when every editorial topic is covered).
  New exports: `resolveTopic` (async, hook-aware; `pickTopic` keeps its signature),
  `allEditorialTopicsCovered`.

### Fixed
- `parseModelJson` no longer fails on a fenced block whose body contains its own `````` fences (the
  lazy first-fence match truncated the object — observed as "attempt 1 unparseable" on live runs).
  It now tries the widest fenced span, each fenced block, the raw text, the outermost `{...}` slice,
  and a repair pass that escapes raw newlines/tabs inside string literals. Exported
  `repairJsonStringNewlines`. Unparseable output now logs the tail as well as the head.
- Refresh pins the slug through `normalizeGeneratedPost` instead of overwriting it afterwards.

## 0.5.1 — 2026-08-22

- Refresh mode fills missing hero dimensions from the local image, so a
  pre-contract post's refresh also closes the CLS gap.
- Readers accept common frontmatter aliases: `pubDate`/`updatedDate`,
  `heroImage`/`cover`, `heroAlt`/`coverAlt` (cadence guard, audit, scorecard,
  schema all see sites that keep their own shape).
- `runBlogGenerateCli` returns the `GenerateRunResult` (written slugs) so
  wrapper scripts no longer need to diff the content directory.

## 0.5.0 — 2026-08-22

Evidence, measurement, and distribution — the rest of the roadmap that the
engine can own.

### Added
- **Two-signal demand gate** (`content.requireTwoDemandSignals`): GSC topics
  need an independent corroborating signal (public autocomplete by default,
  `hooks.fetchDemandSignals` to override).
- **Verified sources** (`content.requireSources`, `topics.trustedSourceDomains`,
  `hooks.verifySource`): 2–4 real sources per post, host-allowlisted and
  fetched live before publish; `sources` frontmatter, `heroImageSrcset`,
  schema `citation`.
- **Responsive hero variants** (`image.variants` → `imageSrcset`), `writeHeroVariants`.
- **Backlog healing** in refresh mode: no Search Console candidate → worst
  FIX post (`RefreshRunOptions.backlog`, default on).
- **Fan-out into owner pages**: `generateFanoutPassages`, `runBlogFanoutCli`.
- **Scorecard**: `runScorecard` / `runBlogScorecardCli` / `blogScorecardWorkflow`
  (cadence, corpus, feed, workflow health via GitHub API, Search Console,
  citations; `SCORECARD_WEBHOOK_URL`; `--strict`). `hooks.probeCitations`
  + `CitationProbe` type.
- **Syndication**: `webhookAdapter`, `slackAdapter`, `linkedinAdapter`,
  `createAfterIndexedHook`.

### Compatibility
- All opt-in/additive. `parseBlogFrontmatter` returns an extra `sources` array.

## 0.4.3 — 2026-08-22

- `paths.blogBasePath` (default `/blog`): sites whose posts live under another
  prefix (e.g. `/log/<slug>`) get correct URLs in pings, RSS, the link graph,
  the audit, rank rescue/refresh, and schema/discovery defaults.

## 0.4.2 — 2026-08-22

- Refresh prompt now carries the same owner-page guidance and existing-post
  link targets as the generate prompt (refreshed posts join the link graph).
- `topics.excludeQuery(query)` — drop a Search Console query family from topic
  selection without writing a `fetchGscQueries` hook.

## 0.4.1 — 2026-08-22

- Removed the `prepare` script. `dist/` is committed and CI enforces it is
  current, so `npm install github:BizrnrAI/blog-engine#<sha>` no longer runs
  a TypeScript build in the consumer's install (faster, no toolchain needed).
  The repo is public — sites can depend on it directly instead of vendoring.

## 0.4.0 — 2026-08-22

Growth-loop release: the engine now improves what already ranks, links the
corpus together, and audits itself.

### Added
- **Refresh mode** — `refreshBlogRun` / `refreshBlogPost` / `runBlogRefreshCli`:
  regenerate an existing post under the content contract using its real Search
  Console queries; slug, publish date, hero, OG card, gradient and author are
  preserved, `updated` is bumped honestly. `blogRefreshWorkflow()` builder.
- **Rank rescue** — `getGscPageQueries` (page×query, 28d) +
  `rankRescueCandidates` implementing the skill's scoring
  (impressions × intent × position multiplier × zero-click) and action classes.
- **Internal link graph** — generation offers existing posts as validated link
  targets (`relatedLinkTargets`); `relatedPosts()` for templates.
- **Corpus audit** — `auditBlogCorpus` / `runBlogAuditCli` SHIP / FIX / BLOCK.
- Schema: `inLanguage`, `wordCount`, `isPartOf` on posts; `blogSchema()`,
  `authorProfileSchema()`; `identity.locale` (also RSS `language`).
- Hooks: `fetchGscPageQueries`, `afterIndexed` (syndication seam).

### Compatibility
- All additive; adapters unaffected. Validation now also accepts links to
  existing posts' `/blog/<slug>` paths.

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
