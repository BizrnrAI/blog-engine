# Adopting the engine on a site

From nothing to an autonomous, quality-gated blog. Follow the steps in order; each one is
verifiable before you move on.

**Decide one thing first — where posts live:**

- **Platform store.** Publishing is an upsert; no git, CI, tokens or rebuild involved.
  Do steps 1–4, then [docs/SERVICE.md](SERVICE.md).
- **Markdown files.** Publishing is a commit; CI builds and deploys. Right for static-export
  sites. Do steps 1–6.

Everything except step 5 is identical for both.

---

## 1. Install

```bash
npm install github:BizrnrAI/blog-engine#v1.2.0
```

Public repo, compiled `dist/` committed, so there is no build step on install. Pin the exact
release tag for reproducibility.

The smallest complete adapter lives in `examples/minimal` — copy it if you'd rather start from
working code than from this page.

## 2. Write the adapter

One file, roughly 80 lines, exporting three things. This is the *entire* per-site surface.

```ts
import type { BlogEngineConfig, BlogEngineTopics } from '@bizrnr/blog-engine/core';

export const config: BlogEngineConfig = {
  identity: {
    name: 'Acme Plumbing',
    siteUrl: 'https://acmeplumbing.com',
    siteHost: 'acmeplumbing.com',
    agent: { name: 'Alex Acme' },              // credentials (title/license) are optional
    author: { name: 'Alex Acme', url: '/about',
              id: 'https://acmeplumbing.com/#person' },   // E-E-A-T entity
    locale: 'en-US',
    ctaPath: '/contact',
  },
  paths: {
    blogBasePath: '/blog',                     // '/log', '/insights' — whatever your URLs use
    trailingSlash: true,                       // declare once; every emitted post URL follows it
    blogDir: 'src/content/blog',               // file store only
    assetDir: 'public/assets/blog',            // branded OG cards
    heroDir: 'public/assets/blog/generated',   // watermarked heroes
    brandLogo: 'public/logo.png',              // OG card logo (SVG works; missing degrades)
    watermarkLogo: 'public/logo.png',
  },
  gsc: {
    property: 'sc-domain:acmeplumbing.com',
    sitemap: 'https://acmeplumbing.com/sitemap.xml',
    sitemaps: ['https://acmeplumbing.com/sitemap-blog.xml'],
  },
  indexNow: { key: '<key>' },                  // also host /<key>.txt publicly
  text: { provider: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions',
          model: 'deepseek/deepseek-v4-flash', maxTokens: 4000, temperature: 0.7 },
  image: { /* copy from examples/sdbg/config.ts and change the colours */ } as never,
  rss: { title: 'Acme Insights', description: 'Answer-first plumbing guides.',
         path: '/blog/feed.xml', limit: 20 },
  content: {
    maxPostsPerWeek: 2,                        // ASEO cadence policy
    blockedPhrases: ['guaranteed savings'],    // your claims discipline
  },
};

export const topics: BlogEngineTopics = {
  allowedCategories: ['Guides', 'Local', 'Maintenance'],
  crossPromoEvery: 4,
  gradients: ['g1', 'g2'],
  heroPhotos: [{ url: '/assets/fallback-1.jpg', alt: 'Descriptive alt' }],
  internalLinks: ['/', '/blog', '/services/drain-cleaning'],   // the ONLY paths posts may link
  ownerPages: ['/services/drain-cleaning'],                    // posts support these, never compete
  editorial: [{ keyword: 'winter pipe care', category: 'Maintenance', angle: 'prevention' }],
  crossPromo: [],
};

export const brandPersona = () =>
  'You are the blog writer for Acme Plumbing… (voice, audience, what you never claim).';
```

Three rules that prevent most adoption problems:

- `internalLinks` must contain only paths that really exist — the validator rejects anything else,
  because models invent plausible 404s.
- Give `editorial` 20+ topics. The rotation skips anything already covered.
- Every logo path must exist, or the OG card falls back to a wordmark (it will not fail the run).

`configureBlogEngine()` validates all of this and throws one error listing every problem, each
naming the config path. Run it once before wiring anything else.

## 3. Choose your store

**Any platform:** supply the provider-neutral `BlogStore` interface. The engine never needs to
know whether the implementation is a directory database, CMS, API, or another storage service.

**Optional Supabase adapter:**

```ts
import { createSupabaseStore } from '@bizrnr/blog-engine/adapters/supabase';
hooks: { store: createSupabaseStore({ siteId: 'acme-plumbing', author: 'Alex Acme' }) }
```

Apply `sql/0001_blog_posts.sql` once per Supabase project. Then continue at
[docs/SERVICE.md](SERVICE.md).

**Files:** omit `hooks.store` entirely. The filesystem is the default.

## 4. Wire the commands

```json
{
  "scripts": {
    "blog:generate":  "tsx scripts/blog/generate.ts",
    "blog:index":     "tsx scripts/blog/index-published.ts",
    "blog:refresh":   "tsx scripts/blog/refresh.ts",
    "blog:audit":     "tsx scripts/blog/audit.ts",
    "blog:scorecard": "tsx scripts/blog/scorecard.ts"
  }
}
```

Each script is two lines — import the runner, pass the adapter:

```ts
import { runBlogGenerateCli } from '@bizrnr/blog-engine/core';
import { config, topics, brandPersona, hooks } from './adapter';
await runBlogGenerateCli({ config, topics, brandPersona, hooks });
```

| Command | What it does | Useful flags |
|---|---|---|
| `blog:generate` | Write one new post | `--count=N` `--dry-run` `--skip-ping` |
| `blog:index` | Submit live URLs to IndexNow + GSC | `--slugs=a,b` `--wait-live` |
| `blog:refresh` | Re-optimize a post already ranking 8–30, or heal the audit backlog | `--slugs=a` `--max=N` `--dry-run` |
| `blog:audit` | SHIP / FIX / BLOCK for the whole corpus | `--json` `--strict` |
| `blog:scorecard` | Cadence, corpus, live probes, index coverage, crawler access | `--strict` `--workflows=a.yml,b.yml` |

`BLOG_ENGINE_DISABLED=1` is the kill switch for every command.

## 5. Publish

**Database:** run the service on a schedule — see [docs/SERVICE.md](SERVICE.md). Nothing else to
set up; there is no repository involvement in publishing.

**Files:** stamp the GitHub Actions workflows and let CI open and merge the PR:

```ts
import { blogGenerateWorkflow, blogIndexingWorkflow, blogRefreshWorkflow,
         blogScorecardWorkflow } from '@bizrnr/blog-engine/core';
writeFileSync('.github/workflows/blog-generate.yml', blogGenerateWorkflow());
writeFileSync('.github/workflows/blog-indexing.yml', blogIndexingWorkflow());
writeFileSync('.github/workflows/blog-refresh.yml',  blogRefreshWorkflow());
writeFileSync('.github/workflows/blog-scorecard.yml', blogScorecardWorkflow());
```

Then read [docs/WORKFLOWS.md](WORKFLOWS.md) — especially the repository settings Actions needs to
open a PR, and why a merge that nobody performs is a queue rather than a gate. Both have caused
multi-week silent outages in production.

## 6. Render the posts

**AllWeb database:** use the canonical reader. Do not copy a gateway fetch into each website and
do not expose a Supabase anon or service-role credential:

```ts
import { createResilientAllWebBlogReader } from '@bizrnr/blog-engine/adapters/allweb';

const blog = createResilientAllWebBlogReader({
  siteId: websiteManifest.site_id,
  apiUrl: websiteManifest.allweb.api_url,
});

const { posts, available, stale } = await blog.listPublishedPosts({ includeContent: false });
const one = await blog.getPublishedPost(slug);
```

Use `getPublishedPost()` for a dynamic post route; never search a capped list for one slug.
Use `listPublishedPosts()` for the hub, feed, sitemap, related links, and corpus gates. It follows
AllWeb pagination automatically. If `available` is false, return 503 + `Retry-After`; if `stale`
is true, render the last-known-good value with `no-store`. A null post is a real 404 only when
`available` is true. Use the basic `createAllWebBlogReader({ failClosed: false })` in strict
CI/content gates, where an unavailable or mismatched store must throw.

**Direct Supabase database:** query the table with the dedicated project credential and
revalidate; a new row appears on the next revalidation.

**Files:**

```ts
import { readGeneratedBlogPosts, mergeBlogPosts } from '@bizrnr/blog-engine/core';
const posts = mergeBlogPosts(seedPosts, readGeneratedBlogPosts({ fallback: { /* … */ } }));
```

Either way, the post page must render:

- the quick `answer` as a visible block near the top — **server-rendered**, because an answer
  engine that needs JavaScript sees nothing;
- the FAQs as visible text *and* `blogPostGraph(post, { publisher, speakableSelectors })` in a
  single `<script type="application/ld+json">`;
- the hero with its `alt`, intrinsic `width`/`height`, and `srcset` when present;
- three `relatedPosts(post, posts, 3, exclude)` links.

And the surfaces around it, all sharing one exclude list so they cannot disagree:

```ts
const exclude = blockedSlugs(auditBlogCorpus(process.cwd()));   // or auditPosts(await store.listPosts())
blogSitemapEntries(posts, { exclude });
blogHubSitemapEntry(posts);                    // hub lastmod — without it new posts sit undiscovered
buildBlogLlmsTxt(posts, { exclude });
buildBlogRss(rssPosts, { root: process.cwd(), exclude });
```

## 7. Secrets

Copy [.env.example](../.env.example). The minimum is one text-model key; everything else degrades
gracefully — no Search Console means editorial topics only, no image key means curated fallback
heroes. See [docs/PROVIDERS.md](PROVIDERS.md) to use your own model stack instead.

## 8. First run

```bash
BLOG_ENGINE_DISABLED=1 npm run blog:generate    # proves wiring, no model call
npm run blog:generate -- --count=1 --skip-ping  # a real post
npm run blog:audit                               # inspect the corpus verdicts
```

Check the post: frontmatter or row complete, hero watermarked and dimensioned, OG card branded,
internal links real, FAQs present. Then let the schedule take over.

---

## Fitting a site that doesn't match the defaults

Every one of these is a supported seam, not a fork:

| Your situation | The seam |
|---|---|
| Posts live in a database or CMS | `hooks.store` (or `hooks.persistPost` for dual-write) |
| Your own frontmatter keys (`pubDate`, `cover`, `readingTime`) | Handled automatically; extend with `paths.frontmatterAliases` or `hooks.parseFrontmatter` |
| `.mdx`, or another extension | `paths.contentExtensions` |
| A different frontmatter shape entirely | `hooks.renderMarkdown` |
| Your own model, or a non-OpenAI API | `hooks.generateText` / `hooks.generateHeroImage` |
| Service-account Search Console auth | `hooks.fetchGscQueries` / `fetchGscPageQueries` / `submitSitemap` |
| A curated, priority-ordered topic catalog | `slug`/`title` pins on editorial topics, `hooks.pickTopic`, `hooks.deriveTopic` |
| Posts under `/log` or `/insights` | `paths.blogBasePath` |
| Canonical post URLs end in `/` | `paths.trailingSlash: true` |
| Announce new posts somewhere | `hooks.afterIndexed` + `createAfterIndexedHook([...adapters])` |
| Index-coverage reporting | `hooks.inspectUrl` |

If you find yourself writing a workaround in a site adapter, check this table first — and if the
seam genuinely doesn't exist, it belongs in the engine, not in your site.
