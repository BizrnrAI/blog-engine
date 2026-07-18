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
