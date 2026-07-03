# BizRnR Blog Engine

Canonical autonomous blog engine for BizRnR websites and client templates.

It owns the shared architecture for:

- SEO/AEO post generation with validation and duplicate prevention
- GSC-informed topic selection with editorial fallback pools
- Optional AI hero image generation through Vercel AI Gateway
- Logo watermarking through Sharp
- Branded Open Graph image generation
- RSS feed XML with media tags
- IndexNow URL submission and GSC sitemap resubmission
- PR-safe publishing workflows where live URL indexing happens after merge
- Generated Markdown reading for `src/content/blog`
- Template-site runtime defaults for Business Runner website clones
- Shared generate/index CLI runners and workflow YAML builders

## Adoption Contract

Each website supplies only a small adapter:

- `BlogEngineConfig`: brand, site URL, paths, logo paths, GSC, IndexNow, model, image, RSS settings
- `BlogEngineTopics`: allowed categories, internal links, fallback hero photos, editorial topics, cross-promo topics
- `brandPersona()`: the brand-safe system persona used for text generation

Then call:

```ts
import { configureBlogEngine, generateBlogRun } from '@bizrnr/blog-engine';

configureBlogEngine({ config, topics, brandPersona });
await generateBlogRun(process.cwd(), { count: 1, dryRun: false, skipPing: true });
```

`skipPing: true` is recommended for PR-producing workflows. Use a post-merge
workflow to call `pingIndexNow()` and `pingGscSitemap()` after the production URL
returns `200`.

## Template Website Runtime

Generic Business Runner website templates can use the package-owned runtime
builder instead of copying config glue into every repo:

```ts
import { buildTemplateBlogEngineRuntime, runBlogGenerateCli } from '@bizrnr/blog-engine';
import { getSite } from './src/sites';

await runBlogGenerateCli(buildTemplateBlogEngineRuntime(getSite()), process.cwd());
```

For live URL indexing after merge:

```ts
import { buildTemplateBlogEngineRuntime, runBlogIndexPublishedCli } from '@bizrnr/blog-engine';
import { getSite } from './src/sites';

await runBlogIndexPublishedCli(buildTemplateBlogEngineRuntime(getSite()));
```

Generated posts can be read and merged into a site blog index, RSS feed,
sitemap, `llms.txt`, and `/ai-context`:

```ts
import { mergeBlogPosts, readGeneratedBlogPosts } from '@bizrnr/blog-engine';

const generated = readGeneratedBlogPosts({
  fallback: {
    description: site.description,
    author: site.legalName,
    heroImage: site.hero.image,
    heroImageAltPrefix: site.brand,
    tags: [site.industry, site.primaryMarket],
  },
});
const posts = mergeBlogPosts(site.blogPosts, generated);
```

The package also exports `blogGenerateWorkflow()` and `blogIndexingWorkflow()`
for stamping PR-safe GitHub Actions into new template repos.

## Canonical Rules

- No generated blog workflow pushes straight to `main`.
- Generated content opens a PR, build-gates, then merges through the repo rules.
- Search engine pings happen only after the URL is live on production.
- Every generated visual must use the site-provided logo watermark or branded OG card.
- No forms are required in blog CTAs; voice-agent sites should route urgency to the voice widget.
- `llms.txt` and the HTML layout should expose the RSS feed.
- `/blog/feed.xml` must include `media:content` and an `enclosure` for each visual post.
- Generated Markdown lives under `src/content/blog`; generated heroes and OG cards stay local.

## SDBG Example

`examples/sdbg` shows the San Diego Buy Guy adapter: brand config, topic pools,
CLI generation, and live indexing. It is an example adapter, not the engine core.

## Template Example

`examples/template` shows the minimal site-profile runtime adapter for generic
template websites.
