# Adopting the blog engine on a website

This guide takes a site from zero to autonomous, quality-gated blog
publishing. It assumes an Astro/Next-style repo with content at
`src/content/blog` and static assets under `public/`, but every path is
configurable.

## 0. Install

```bash
npm install github:BizrnrAI/blog-engine
# or, in a monorepo / vendored setup, copy the repo and `npm install ./blog-engine`
```

The package ships compiled `dist/`, so no build step is required on install.

## 0.5 Start from the minimal example

The fastest correct start is to copy
[examples/minimal/runtime.ts](../examples/minimal/runtime.ts) and change the
strings. It is a complete adapter for a business with **no** AI voice agent, no
partner site, no professional licence and no service areas — i.e. most
websites — and it is covered by the test suite, so it cannot drift out of date.

`configureBlogEngine()` validates your adapter the moment you call it and
throws a single error listing every problem, each naming the exact config path:

```
Blog engine configuration is not usable:
  • topics.internalLinks must contain at least one path — posts are required to
    link internally, so an empty list can never validate
  • identity.siteHost must be a bare host, without https://

See docs/ADOPTION.md for a minimal working adapter.
```

To lint an adapter in CI without configuring the engine, call
`validateBlogEngineRuntime(runtime)` and assert it returns `[]`.

## 1. Write the adapter

Create `scripts/blog/adapter.ts` (or `.mjs`) exporting three things:

```ts
import type { BlogEngineConfig, BlogEngineTopics } from '@bizrnr/blog-engine';

export const config: BlogEngineConfig = {
  identity: {
    name: 'Acme Plumbing',
    siteUrl: 'https://acmeplumbing.com',
    siteHost: 'acmeplumbing.com',
    agent: { name: 'Alex Acme', title: 'master plumber', titleCap: 'Master Plumber', license: 'LIC-123' },
    areas: ['Springfield', 'Shelbyville'],
    voice: { name: 'AVA', homeCtaPath: '/' },          // the site's voice agent
    backlink: { url: 'https://bizrnr.com', deepLink: 'https://bizrnr.com/automation-officer' },
  },
  paths: {
    blogDir: 'src/content/blog',
    assetDir: 'public/assets/blog',            // branded OG cards land here
    heroDir: 'public/assets/blog/generated',   // watermarked AI heroes land here
    brandLogo: 'public/logo.png',              // used on OG cards
    watermarkLogo: 'public/logo.png',          // composited onto every AI hero
  },
  gsc: { property: 'sc-domain:acmeplumbing.com', sitemap: 'https://acmeplumbing.com/sitemap.xml' },
  indexNow: { key: '<indexnow-key>' },         // also host /<key>.txt publicly
  text: {
    provider: 'openrouter',                    // or 'openai-compatible'
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'deepseek/deepseek-v4-flash',
    maxTokens: 4000,
    temperature: 0.7,
  },
  image: { /* model, size, watermark, og colors — copy examples/sdbg/config.ts */ } as any,
  rss: { title: 'Acme Insights', description: 'Answer-first plumbing guides.', path: '/blog/feed.xml', limit: 20 },
  content: {
    // Optional overrides of the ASEO content contract:
    blockedPhrases: ['guaranteed savings', 'lowest price in town'],
  },
};

export const topics: BlogEngineTopics = {
  allowedCategories: ['Guides', 'Local', 'Maintenance'],
  crossPromoEvery: 4,                          // every 4th post backlinks BizRnR
  gradients: ['g1', 'g2', 'g3'],
  heroPhotos: [{ url: '/assets/fallback-1.jpg', alt: 'Descriptive alt' }],
  internalLinks: ['/', '/blog', '/services/drain-cleaning'],  // the ONLY paths posts may link
  editorial: [{ keyword: 'winter pipe care springfield', category: 'Maintenance', angle: 'prevention checklist' }],
  crossPromo: [{ keyword: 'AVA voice intake for plumbers', angle: 'never miss an emergency call' }],
};

export const brandPersona = () =>
  'You are the blog writer for Acme Plumbing… (brand-safe persona, tone, audience).';
```

Rules of thumb:

- `internalLinks` must contain only paths that really exist — the validator
  rejects posts linking anywhere else.
- Give `editorial` 20+ topics; the rotation skips anything already covered.
- Every logo path must exist; the watermark invariant fails loudly otherwise.

Template-based Business Runner sites can skip all of this and derive the
runtime from their existing `TemplateSiteProfile` via
`buildTemplateBlogEngineRuntime(site)`.

## 2. Wire the CLI scripts

`package.json`:

```json
{
  "scripts": {
    "blog:generate": "tsx scripts/blog/generate.ts",
    "blog:index": "tsx scripts/blog/index-published.ts"
  }
}
```

`scripts/blog/generate.ts`:

```ts
import { runBlogGenerateCli } from '@bizrnr/blog-engine';
import { config, topics, brandPersona } from './adapter';
await runBlogGenerateCli({ config, topics, brandPersona });
```

`scripts/blog/index-published.ts`:

```ts
import { runBlogIndexPublishedCli } from '@bizrnr/blog-engine';
import { config, topics, brandPersona } from './adapter';
await runBlogIndexPublishedCli({ config, topics, brandPersona });
```

CLI flags: `--count=N`, `--dry-run`, `--skip-ping` (generate);
`--slugs=a,b`, `--wait-live`, `--dry-run` (index). Env equivalents:
`DRY_RUN=1`, `SKIP_PING=1`, `BLOG_SLUGS`, `WAIT_FOR_LIVE=1`,
`BLOG_ENGINE_DISABLED=1` (kill switch).

## 3. Render the posts

Read generated posts into your site's blog index, feed, and sitemap:

```ts
import { readGeneratedBlogPosts, mergeBlogPosts, buildBlogRss, blogPostGraph } from '@bizrnr/blog-engine';

const generated = readGeneratedBlogPosts({ fallback: { description, author, heroImage, heroImageAltPrefix, tags } });
const posts = mergeBlogPosts(seedPosts, generated);
```

Per post page, render:

- The `answer` frontmatter as a visible quick-answer block near the top
  (server-rendered — answer engines must see it before JavaScript).
- FAQs as visible `<details>` (or open Q/A blocks) **and** emit
  `blogPostGraph(post, { author: { id: `${siteUrl}/#person`, name }, publisher: { id: `${siteUrl}/#organization`, name } })`
  as a single `<script type="application/ld+json">`.
- `image` with `imageAlt`, explicit width/height, `ogImage` for social meta.

For the feed route, `buildBlogRss(rssPosts, { root: process.cwd() })` gives
real enclosure byte lengths. Add `<link rel="alternate" type="application/rss+xml">`
to the layout and list the feed URL in `llms.txt`.

## 4. Stamp the workflows

```ts
import { blogGenerateWorkflow, blogIndexingWorkflow } from '@bizrnr/blog-engine';
writeFileSync('.github/workflows/blog-generate.yml', blogGenerateWorkflow());
writeFileSync('.github/workflows/blog-indexing.yml', blogIndexingWorkflow());
```

Then read [WORKFLOWS.md](WORKFLOWS.md) — especially the GitHub repo settings
required for Actions to open PRs, and why pings only happen post-merge.

## 5. Secrets

Copy [.env.example](../.env.example) and set what your provider choice needs.
For CI, add the same names as repo secrets. `GOOGLE_OAUTH_*` are optional —
without them the engine skips GSC demand queries and uses the editorial pool.

## 6. First run

```bash
DRY_RUN=1 npm run blog:generate -- --count=1   # inspect output, no writes, no image spend
npm run blog:generate -- --count=1 --skip-ping # real run on a branch
```

Verify: the Markdown file, the watermarked hero under `heroDir`, the OG card
under `assetDir`, tags/description/answer/FAQs in frontmatter. Then open the
PR and let the post-merge indexing workflow handle pings.

## 8. Growth loop (v0.4.0)

```json
{ "scripts": { "blog:refresh": "tsx scripts/blog/refresh.ts", "blog:audit": "tsx scripts/blog/audit.ts" } }
```

```ts
// scripts/blog/refresh.ts — rank rescue picks a post at position 8–30 and refreshes it (PR flow)
import { runBlogRefreshCli } from '@bizrnr/blog-engine';
await runBlogRefreshCli({ config, topics, brandPersona });   // --slugs=a,b | --max=N | --dry-run

// scripts/blog/audit.ts — SHIP / FIX / BLOCK for every post
import { runBlogAuditCli } from '@bizrnr/blog-engine';
await runBlogAuditCli({ config, topics, brandPersona });     // --json | --strict | --stale-days=365
```

Stamp the weekly refresh workflow with `blogRefreshWorkflow()` (needs the
GOOGLE_OAUTH_* secrets or a `fetchGscPageQueries` hook; without Search Console
data refresh still works for explicit `--slugs`). Render `relatedPosts(post,
posts, 3)` under every article, emit `blogSchema({ name })` on the hub and
`authorProfileSchema({...})` on the author page, and wire syndication in
`hooks.afterIndexed`.

## 7. v0.3.0 additions worth turning on

```ts
config.identity.author = { name: 'Jane Doe', id: 'https://acmeplumbing.com/#person' }; // E-E-A-T
config.content.maxPostsPerWeek = 2;                 // ASEO cadence cap for search-led posts
topics.ownerPages = ['/services/drain-cleaning'];   // posts support owners, never compete
```

Render-side helpers that keep sitemap, feed, and AI context in parity:

```ts
import { blogSitemapEntries, buildBlogLlmsTxt, blogPostGraph } from '@bizrnr/blog-engine';
const posts = readGeneratedBlogPosts({ /* … */ });
blogSitemapEntries(posts);                       // [{ loc, lastmod }] — lastmod = updated
buildBlogLlmsTxt(posts, { feedPath: '/blog/feed.xml' }); // markdown block for llms.txt
blogPostGraph(post, { speakableSelectors: ['.speakable-answer'] }); // only if you render that class
```

Use `heroImageWidth`/`heroImageHeight` from parsed posts for explicit `<img width height>`.

## 8.4 Sites that don't store posts as Markdown files (v0.6.0)

A database- or CMS-backed site adopts the engine through `hooks.persistPost` — the engine still
owns generation, validation, images and the content contract, and hands you the finished post:

```ts
hooks.persistPost = async ({ post, cover, markdown, file, isRefresh }) => {
  await db.from('posts').upsert({ slug: post.slug, title: post.title, body: post.body, ... });
  return false;   // false/void = the hook owns persistence; true = ALSO write the file (dual-write)
};
```

Return `true` during a migration to write both places until the file corpus is retired. With no
hook the engine writes the Markdown file exactly as it always has.

An `.mdx` corpus (or any other extension) is a config line:

```ts
config.paths.contentExtensions = ['.mdx', '.md'];   // readers accept both; generation writes the first
```

## 8.5 Keeping your own frontmatter shape, and owning topic choice (v0.5.2)

**Frontmatter aliases.** A site whose posts use `pubDate/updatedDate/cover/coverAlt/readingTime`
needs no translation layer: the readers normalize those onto the engine's canonical keys, so the
cadence guard, corpus audit, scorecard, refresh and schema all see real dates and images. Original
keys are preserved and a canonical key always wins over an alias. Two escape hatches:

```ts
config.paths.frontmatterAliases = { summary: 'description' };   // extend the default table
hooks.parseFrontmatter = ({ raw, slug }) => myYamlParser(raw);  // or own the parse entirely (null = fall back)
```

**Topic pinning.** A curated, priority-ordered catalog can own its URLs and headlines:

```ts
topics.editorial = [
  { keyword: 'when to automate', category: 'Guides', angle: 'judgement',
    slug: 'when-not-to-automate', title: 'When Not to Automate' },   // pinned: exact URL + headline
];
hooks.pickTopic = ({ existing, gscQueries, offset }) => myCatalog.next(existing) ?? null; // null = engine rotation
hooks.deriveTopic = ({ existing }) => askModelForFreshTopic(existing); // when the pool is exhausted
```

A pinned `slug` is written verbatim (no stop-word stripping), a pinned `title` is used as-is, the
prompt states both, and the validator asserts them. Pinned topics also make coverage detection
exact instead of heuristic — question-style titles no longer look "already covered".

## 9. Measurement, distribution, and evidence (v0.5.0)

```json
{ "scripts": { "blog:scorecard": "tsx scripts/blog/scorecard.ts", "blog:fanout": "tsx scripts/blog/fanout.ts" } }
```

- **Scorecard** — `runBlogScorecardCli(runtime)` + `blogScorecardWorkflow({ workflowsToWatch: ['autoblog.yml','blog-indexing.yml','blog-refresh.yml'] })`.
  Set the `SCORECARD_WEBHOOK_URL` secret (Slack incoming webhook or any JSON
  endpoint) and a red cron, a stale cadence, a broken feed, or a BLOCK post
  reaches you within a day. `--strict` makes the workflow itself go red.
- **Syndication** — in the adapter: `hooks.afterIndexed = createAfterIndexedHook([
  slackAdapter(), webhookAdapter({ urlEnv: 'ZAPIER_HOOK_URL' }), linkedinAdapter({ authorUrn: 'urn:li:organization:123' }) ])`.
- **Demand gate** — `content.requireTwoDemandSignals: true` (default second
  source: public autocomplete; override with `hooks.fetchDemandSignals`).
- **Sources** — `content.requireSources: true` + `topics.trustedSourceDomains:
  ['census.gov', …]`; render `post.sources` as a visible "Sources" list (schema
  emits `citation` automatically; visible/machine parity).
- **Responsive heroes** — `image.variants: [1024, 640]` → `imageSrcset`
  frontmatter → `heroImageSrcset` for `<img srcset sizes>`.
- **Fan-out** — `npm run blog:fanout -- --owner=/buy` writes
  `src/content/fanout/buy.json`; render its passages on the owner page (+ `faqPageSchema`).

## 10. Traffic practices the engine now enforces (v0.6.0)

Turn these on per site:

```ts
topics.preferVerificationIntent = true;        // answer "is X legit / X vs Y" before head terms
config.content.maxPostsPerWeek = 2;            // ASEO cadence policy for search-led posts
config.content.minDaysBetweenRefresh = 45;     // default; let a change surface before rewriting
hooks.inspectUrl = async ({ url }) => gsc.urlInspection(url);   // index coverage, not guesswork
```

Render side — one exclude list, one hub entry:

```ts
const audit = auditBlogCorpus(process.cwd());
const exclude = blockedSlugs(audit);                 // BLOCK verdicts leave every public surface
blogSitemapEntries(posts, { exclude });
blogHubSitemapEntry(posts);                          // hub lastmod = newest post — without it the
buildBlogLlmsTxt(posts, { exclude });                // hub is never refetched and new posts sit
buildBlogRss(rssPosts, { root, exclude });           // undiscovered for days
relatedPosts(post, posts, 3, exclude);
```

Scorecard additions (all automatic): live 200 probes for hub/feed/newest/oldest,
`answer-pre-js` extractability, retrieval-crawler robots check, fixed-cohort index
coverage, striking-distance (11–20) count, cannibalization, review-queue age, and a
warning when no cadence cap is set.
