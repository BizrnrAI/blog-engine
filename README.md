# BizRnR Blog Engine

Provider-neutral, answer-first blog publishing for any website or platform. One shared engine writes the post,
validates it against a strict content contract, generates and watermarks the imagery, stores it,
submits it to search engines, then keeps improving what already ranks.

**New here? Read [Start here](#start-here) — it's three questions and a path.**

- Package: `@bizrnr/blog-engine` · install `github:BizrnrAI/blog-engine#v1.2.0` (public, no build step)
- Agents: [AGENTS.md](AGENTS.md) is the entry point for working *on* this repo
- Everything is self-contained: no BizRnR, AllWeb, Supabase, or other external system is required

The canonical API is `@bizrnr/blog-engine/core`. It imports no database or control-plane adapter.
Optional integrations are explicit subpaths under `@bizrnr/blog-engine/adapters/*`; the legacy
top-level exports remain temporarily for v1 compatibility.

## Start here

**1. Where should posts live?**

| | Choose | Read |
|---|---|---|
| **Your platform store** | Implement `BlogStore` for SQL, a CMS, an API, object storage, or another backend | [docs/PROVIDERS.md](docs/PROVIDERS.md) |
| **Maintained optional adapter** | Filesystem, Supabase, and AllWeb adapters are available as explicit subpath imports | [docs/SERVICE.md](docs/SERVICE.md) |

Both run the same engine, the same content contract, the same validators and the same scorecard.
The only difference is one line of adapter config, and you can switch later.

**2. How much do you need to write?** A site supplies an *adapter*: who the brand is, which pages
posts may link to, and the topic pool. That's it — roughly 80 lines. The engine owns everything
else. See [docs/ADOPTION.md](docs/ADOPTION.md#2-write-the-adapter).

**3. Running many sites?** One service publishes for all of them from a single process. See
[docs/SERVICE.md](docs/SERVICE.md#the-service).

## Sixty-second version

```bash
npm install github:BizrnrAI/blog-engine#v1.2.0
```

```ts
import { configureBlogEngine, generateBlogRun } from '@bizrnr/blog-engine/core';
import { config, topics, brandPersona } from './blog/adapter';

configureBlogEngine({
  config, topics, brandPersona,
});

await generateBlogRun(process.cwd(), { count: 1, dryRun: false, skipPing: false });
```

That uses the filesystem default. To use any other platform, supply a `BlogStore` implementation;
the generation pipeline does not change. Maintained adapters are opt-in subpath imports.

AllWeb-managed repositories use the same engine with a least-privilege adapter,
not a Supabase service role:

```ts
import { createAllWebStore } from '@bizrnr/blog-engine/adapters/allweb';

hooks: {
  store: createAllWebStore({
    siteId: websiteManifest.site_id,
    apiUrl: websiteManifest.allweb.api_url,
  }),
}
```

The adapter reads `ALLWEB_SITE_TOKEN`; AllWeb binds that token to exactly one
immutable website tenant.

Website rendering uses the matching read-only surface rather than copied fetch
logic:

```ts
import { createAllWebBlogReader } from '@bizrnr/blog-engine/adapters/allweb';

const blog = createAllWebBlogReader({
  siteId: websiteManifest.site_id,
  apiUrl: websiteManifest.allweb.api_url,
});

const posts = await blog.listPublishedPosts({ includeContent: false });
const post = await blog.getPublishedPost('canonical-slug');
```

The reader follows pagination, verifies every returned tenant UUID, rejects
non-published rows, bounds network waits, and uses a short invalidatable cache.
It exposes no mutation method. Dynamic public routes should wrap it with
`createResilientAllWebBlogReader()` so a store outage becomes a retryable 503
rather than an empty 200 or a false 404.

## What you get in every post

- An answer-first lede and a 40–60-word quick answer, server-rendered for answer engines
- 4–6 sections, at least two phrased as real search questions, each opening with a direct answer
- One self-contained citable passage (134–167 words, scoped and dated) — the paragraph an
  assistant can quote verbatim
- Three FAQs, rendered on-page and as `FAQPage` schema
- Internal links validated against a real allowlist, plus links to related existing posts
- A photographic hero, watermarked with your logo, plus a branded OG card, descriptive alt text,
  intrinsic dimensions and responsive variants
- `BlogPosting` + `Breadcrumb` + `FAQPage` JSON-LD with stable entity ids
- Zero fabricated statistics, prices, or sources — enforced, not hoped for
- One canonical slash policy across HTML, JSON-LD, RSS, sitemaps, and `llms.txt`
- Every configured sitemap is submitted after a verified live release

## What the engine owns

| Concern | Module | Notes |
|---|---|---|
| **Content store** | `store.ts` | The engine's only route to posts and assets. Filesystem by default, swappable in one line |
| **Provider-neutral core** | `core.ts` | Generation, validation, scheduling, rendering contracts, indexing, audit, and `BlogStore`; imports no database/control plane |
| **Optional Supabase adapter** | `adapters/supabase.ts` | Explicit subpath; posts as rows and assets in Storage via plain `fetch` |
| **Optional AllWeb adapter** | `adapters/allweb.ts` | Explicit subpath; tenant-bound reader/store and site-scoped GSC hooks |
| **Blog service** | `service.ts` | One process publishes for many sites; per-site schedules and failure isolation |
| Post generation | `generate-post.ts` | The content contract, strict-JSON prompting, tolerant parsing, 3-attempt validate-and-retry |
| Topic selection | `topic-rotation.ts`, `demand.ts` | Search Console demand → editorial pool → cross-promo, with a two-signal demand gate |
| Refresh / rank rescue | `refresh.ts`, `rank-rescue.ts` | Re-optimize posts already ranking 8–30; heal the audit backlog when demand data is quiet |
| Corpus audit | `audit.ts` | SHIP / FIX / BLOCK verdicts for every published post |
| Scorecard | `scorecard.ts` | Live probes, retrieval-crawler access, index coverage, cannibalization, review-queue age |
| Imagery | `images.ts` | AI hero (pluggable), Sharp watermarking, branded OG card, responsive variants |
| Structured data | `schema.ts` | `BlogPosting`, `FAQPage`, `Breadcrumb`, `Blog`, author `ProfilePage` |
| Discovery | `discovery.ts` | Sitemap entries, hub `lastmod`, `llms.txt`, related posts, one shared exclude list |
| Feed | `rss.ts` | RSS 2.0 with `media:content` and real enclosure byte lengths |
| Indexing | `indexing.ts`, `gsc.ts` | IndexNow after URLs are live; Search Console demand and sitemap submission |
| Evidence | `sources.ts`, `fanout.ts` | Verified external sources; answer passages for owner pages |
| Distribution | `syndication.ts` | Webhook / Slack / LinkedIn adapters behind `afterIndexed` |
| Frontmatter | `frontmatter.ts` | Key aliases so a site can keep its own shape |
| CLI + workflows | `cli.ts`, `workflows.ts` | Generate/index/refresh/audit/scorecard runners and GitHub Actions builders |
| Template runtime | `template-runtime.ts` | A complete runtime derived from a generic site profile |

## Documentation

| Doc | When to read it |
|---|---|
| [docs/SERVICE.md](docs/SERVICE.md) | Running a multi-site service with your chosen store adapter |
| [docs/ADOPTION.md](docs/ADOPTION.md) | Wiring the engine into one site, step by step |
| [docs/CONTENT-SPEC.md](docs/CONTENT-SPEC.md) | Exactly what every post must contain, and why |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Models, env vars, and the hooks for your own infrastructure |
| [docs/WORKFLOWS.md](docs/WORKFLOWS.md) | PR-safe publishing, and the production gotchas that cost real outages |
| [docs/TRAFFIC.md](docs/TRAFFIC.md) | What actually moves traffic, ranked by measured return |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What's next and what's deliberately out of scope |
| [AGENTS.md](AGENTS.md) | Working *on* the engine: invariants, seams, upkeep |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [docs/skills/aseo/SKILL.md](docs/skills/aseo/SKILL.md) | The full ASEO operating skill this engine implements |

Runnable adapters live in `examples/`: `minimal` (smallest possible), `service` (multi-site
Supabase service), `sdbg` (full brand adapter), `template` (generic site profile).

## Non-negotiables

These hold regardless of how you run it:

- Search engines are pinged only after a URL is live and returns 200.
- Every hero is stored by the engine and watermarked with the site's own logo; no hotlinked stock.
- Every image ships descriptive, non-identical alt text and intrinsic dimensions.
- Frontmatter and row dates are honest — never backdated, never fake-freshened.
- Posts support the site's canonical owner pages; they never compete with them for a query.
- No fabricated statistics, prices, awards, or sources. Sites can add their own blocked phrases.
- Sitemap, feed, `llms.txt` and related posts all take the same exclude list, so public surfaces
  cannot contradict each other.

## Develop

```bash
npm ci
npm run verify   # typecheck + tests + build
```

`dist/` is committed so consumers install straight from git with no build step. CI enforces that
it is current. Pin a tag (`#v0.7.0`) for reproducibility, or the moving `#v0` channel to track
patches.

## Repository map

```
src/            provider-neutral engine plus explicit optional adapters
sql/            optional Supabase adapter schema
tests/          offline test suite — no network, no API keys
examples/       minimal · service · sdbg · template
docs/           SERVICE · ADOPTION · CONTENT-SPEC · PROVIDERS · WORKFLOWS · TRAFFIC · ROADMAP
AGENTS.md       entry point for agents working on the engine
.env.example    every environment variable the engine reads
```
