# BizRnR Blog Engine

Autonomous, answer-first blog generation with direct Supabase publishing. Websites own their
schedules, post counts, and publishing limits. The engine owns generation, validation, image
processing, persistence, refresh, and discovery signals. Blog content never needs a pull request.

## Start here

Install the reviewed v2 release or its exact commit:

```bash
npm install github:BizrnrAI/blog-engine#v2.0.0
```

A website supplies its existing brand configuration, editorial topics, and persona:

```ts
import { runBlogService, formatServiceReport } from '@bizrnr/blog-engine/core';
import { createSupabaseStore } from '@bizrnr/blog-engine/adapters/supabase';
import { config, topics, brandPersona } from './blog/adapter';

const results = await runBlogService([{
  id: 'your-site',
  count: 1, // supplied by the website after its own scheduling/volume checks
  runtime: () => ({
    config, topics, brandPersona,
    hooks: {
      store: createSupabaseStore({ siteId: 'your-site', author: config.identity.author?.name }),
    },
  }),
}], { refresh: true });
console.log(formatServiceReport(results));
if (results.some((result) => result.status === 'failed')) process.exitCode = 1;
```

Apply [sql/0001_blog_posts.sql](sql/0001_blog_posts.sql) and then
[sql/0002_post_punctuation.sql](sql/0002_post_punctuation.sql) to the intended Supabase project.
The second migration repairs existing prose and normalizes future writes without moving URLs,
publication dates, or editorial status. The publisher needs `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`; the website reader uses only its public anon/publishable key.

AllWeb-managed websites can keep `createAllWebStore` through their authorized, site-scoped gateway.
That gateway writes the platform's Supabase rows. Never put a broad service-role credential into
an AllWeb website or bypass a gateway's publication permissions.

The canonical `@bizrnr/blog-engine/core` API stays independent of provider adapters. The filesystem
adapter remains available for offline compatibility and exports, but `runBlogService` and the
stamped publishing workflows reject filesystem fallback by default.

## Render current database content

```ts
import { createSupabaseBlogReader } from '@bizrnr/blog-engine/adapters/supabase';
import { blogPostGraph, serializeBlogJsonLd } from '@bizrnr/blog-engine/core';

const reader = createSupabaseBlogReader({
  url: process.env.SUPABASE_URL!,
  anonKey: process.env.SUPABASE_ANON_KEY!,
  siteId: 'your-site',
});
const posts = await reader.listPublishedPosts();
const post = await reader.getPublishedPost('canonical-slug');
const jsonLd = post ? serializeBlogJsonLd(blogPostGraph(post, { siteUrl: 'https://example.com' })) : null;
```

Render the answer, article, FAQs, sources, and author in the initial HTML. Derive the blog hub,
sitemap, feed, and related posts from these same published rows. Read failures throw: return a
retryable 503, not an empty successful blog or a false 404. Static-export sites need a database
snapshot/rebuild path or server-rendered blog routes before direct publishing becomes visible.

## Quality and reliability

- Em dashes are forbidden in every post field, including HTML entity spellings. Generated prose
  is repaired deterministically; final persistence checks catch custom-renderer regressions.
- Answer-first prose, question headings, FAQs, allowlisted internal links, and optional verified
  source URLs support useful, accessible articles. Supplied source URLs are verified on generation
  and refresh. URL availability is not proof that a source supports a claim.
- New Supabase posts insert uniquely. Duplicate slugs fail instead of overwriting an article.
  Refresh updates only an existing published row and preserves the original publication date.
- Supabase readers paginate the full corpus, enforce tenant/status boundaries, hide future-dated
  public rows, and bound network waits.
- Concurrent services isolate each website's runtime. A failure in one site does not stop others.
- Public URLs must return HTTP 200 at their canonical path before indexing. A redirect is not
  accepted as proof of publication. Syndication reads metadata from the configured store.
- Website-owned schedules and limits are the only publishing throttle. There is no engine weekly
  cap, default publication cron, or `maxPostsPerWeek` setting.

ASEO improvements follow ordinary search fundamentals: useful evidence, crawlable content,
internal discovery, accurate dates, and visible-content/schema parity. Exact passage lengths,
FAQ markup, and `llms.txt` do not guarantee rankings or AI citations.
[Google Search Central](https://developers.google.com/search/docs/appearance/ai-features).

## Documentation and modules

| Read | Purpose |
|---|---|
| [AGENTS.md](AGENTS.md) | Repository invariants and verification |
| [docs/ADOPTION.md](docs/ADOPTION.md) | Brand adapter and hooks |
| [docs/SERVICE.md](docs/SERVICE.md) | Service and website-owned scheduling |
| [docs/WORKFLOWS.md](docs/WORKFLOWS.md) | Direct publishing and indexing retry workflows |
| [docs/CONTENT-SPEC.md](docs/CONTENT-SPEC.md) | Prompt and validation contract |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Provider configuration |
| [docs/TRAFFIC.md](docs/TRAFFIC.md) | Measurement and content improvement |
| [docs/UPGRADE-V2.md](docs/UPGRADE-V2.md) | Cutover, existing-post repair, and deployment limits |
| [docs/AUDIT-2026-09.md](docs/AUDIT-2026-09.md) | Repository review findings and verification |
| [CHANGELOG.md](CHANGELOG.md) | Release changes |

`src/` contains the portable pipeline, explicit provider adapters, schema/discovery/feed helpers,
quality audit, scorecard, indexing, and workflow builders. `examples/` contains site adapters;
`sql/` contains the Supabase schema and punctuation migration. `tests/` is the offline regression suite.

```bash
npm ci
npm run verify
```

`dist/` is committed for git-based installs. CI checks it against source. Updating the package does
not rewrite workflows already copied into website repositories; apply the v2 cutover there too.
