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

## Canonical Rules

- No generated blog workflow pushes straight to `main`.
- Generated content opens a PR, build-gates, then merges through the repo rules.
- Search engine pings happen only after the URL is live on production.
- Every generated visual must use the site-provided logo watermark or branded OG card.
- No forms are required in blog CTAs; voice-agent sites should route urgency to the voice widget.
- `llms.txt` and the HTML layout should expose the RSS feed.

## SDBG Example

`examples/sdbg` shows the San Diego Buy Guy adapter: brand config, topic pools,
CLI generation, and live indexing. It is an example adapter, not the engine core.
