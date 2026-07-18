# BizRnR Blog Engine

Canonical autonomous blog engine for BizRnR websites and client templates. One
shared core generates answer-first, ASEO-optimized posts with AI hero images,
logo watermarks, branded Open Graph cards, alt text, meta tags, FAQ + article
JSON-LD, an RSS feed with media tags, and PR-safe publishing with post-merge
search-engine pings. Each site supplies only a small brand/topic adapter.

**This repo is self-contained.** Everything an AI agent or developer needs to
review, adopt, or extend the engine lives here — see [AGENTS.md](AGENTS.md)
for the agent-facing entry point and [docs/](docs/) for the full manual. No
BizRnR-internal infrastructure is required: every model call goes through a
pluggable seam you can point at your own stack.

## What the engine owns

| Concern | Module | Notes |
|---|---|---|
| Topic selection | `src/topic-rotation.ts` | GSC demand queries → editorial pool → cross-promo cadence, with duplicate-coverage detection |
| GSC integration | `src/gsc.ts` | Search Analytics queries + sitemap resubmission (optional; degrades gracefully) |
| Post generation | `src/generate-post.ts` | ASEO content contract, strict-JSON prompting, tolerant parsing, 3-attempt validate-and-retry |
| Validation | `src/generate-post.ts` | Question-led H2s, citable blockquote, internal-link allowlist, claims discipline, deterministic description clamping |
| Hero images | `src/images.ts` | AI generation (pluggable), Sharp logo watermarking, curated fallback, branded descriptive alt text |
| OG cards | `src/images.ts` | Deterministic branded 1200×630 SVG→JPEG cards, no model call |
| Markdown output | `src/markdown.ts` | Frontmatter with title/description/tags/dates/answer/FAQs/images |
| Content reading | `src/content-reader.ts` | Parse generated posts back for blog index, RSS, sitemap, `llms.txt` |
| JSON-LD | `src/schema.ts` | `BlogPosting` + `FAQPage` + `BreadcrumbList` graph builders with stable `@id`s |
| RSS | `src/rss.ts` | RSS 2.0 with `atom:self`, `media:content`, `enclosure` (real byte lengths, correct MIME) |
| Indexing | `src/indexing.ts` | IndexNow submission after URLs are live |
| CLI runners | `src/cli.ts` | Generate + index-published commands, live-URL polling |
| GitHub Actions | `src/workflows.ts` | PR-safe generate + post-merge indexing workflow YAML builders |
| Template runtime | `src/template-runtime.ts` | Full runtime derived from a generic `TemplateSiteProfile` |

## Quickstart

```ts
import { configureBlogEngine, generateBlogRun } from '@bizrnr/blog-engine';
import { config, topics, brandPersona } from './blog/adapter'; // your site adapter

configureBlogEngine({ config, topics, brandPersona });
await generateBlogRun(process.cwd(), { count: 1, dryRun: false, skipPing: true });
```

`skipPing: true` is required for PR-producing workflows: search engines are
pinged only after the URL is live on production (see
[docs/WORKFLOWS.md](docs/WORKFLOWS.md)).

### Bring your own model stack

The engine defaults to OpenRouter (text) and Vercel AI Gateway (images), but
both are seams, not requirements:

```ts
configureBlogEngine({
  config, topics, brandPersona,
  hooks: {
    // Return the raw model text (strict JSON) from any LLM you run.
    generateText: async ({ messages }) => myLlm.chat(messages),
    // Return a raw image Buffer (engine watermarks + writes it), or null to
    // use the curated fallback photos.
    generateHeroImage: async ({ prompt }) => myImageModel.generate(prompt),
  },
});
```

See [docs/PROVIDERS.md](docs/PROVIDERS.md) for the built-in providers, env
vars, and hook contracts.

## Adoption contract

Each website supplies only a small adapter:

- `BlogEngineConfig` — brand identity, site URLs, content paths, logo paths,
  GSC property, IndexNow key, text/image model settings, RSS settings, and
  optional `content` rules (blocked claim phrases, word counts).
- `BlogEngineTopics` — allowed categories, internal-link allowlist, fallback
  hero photos, editorial topics, cross-promo topics.
- `brandPersona()` — the brand-safe system persona used for text generation.
- Optional `hooks` — your own text/image infrastructure.

Step-by-step: [docs/ADOPTION.md](docs/ADOPTION.md). Working adapters:
`examples/sdbg` (full brand adapter) and `examples/template` (site-profile
runtime for generic Business Runner templates).

## Content contract (ASEO)

Every generated post ships:

- An answer-first lede and a 40–55-word direct `answer` field (quick-answer block).
- 4–6 H2 sections, at least 2 phrased as real search questions, each question
  H2 opening with a 40–60-word direct answer.
- Exactly one self-contained citable blockquote (80–140 words, scoped
  "as of <month year>") — the passage an AI assistant should quote.
- Exactly 3 FAQs (rendered on-page and as `FAQPage` JSON-LD).
- 2–4 internal links drawn only from the adapter's allowlist; validated, no
  invented paths.
- 3–6 topical tags, a clamped ≤158-char meta description, a model-written
  descriptive hero alt text behind a stable brand prefix.
- Zero fabricated statistics, prices, or named sources; optional
  per-site blocked-phrase list enforced at validation time.

Full spec and rationale: [docs/CONTENT-SPEC.md](docs/CONTENT-SPEC.md).

## Canonical rules

- No generated blog workflow pushes straight to `main`. Generate on a branch,
  build-gate, open a PR, merge through repo rules.
- Search engine pings happen only after the URL returns 200 on production.
- Every generated hero is stored locally and watermarked with the site's own
  logo; every post gets a local branded OG card. No hotlinked stock images.
- Every image ships descriptive, non-identical alt text.
- Blog CTAs route to the site's voice agent, never to forms.
- `llms.txt` and the HTML layout expose the RSS feed; the feed includes
  `media:content` and `enclosure` with real byte lengths.
- Generated Markdown lives under `src/content/blog`; assets stay local.
- Frontmatter dates are honest — never backdated, never fake-freshened.

## Develop

```bash
npm ci
npm run verify   # typecheck + tests + build
npm test         # node:test suite only
```

The compiled `dist/` is committed so consumers can install straight from git.
`npm run verify` must pass before any PR; CI enforces it.

## Repository map

```
src/            engine core (see table above)
tests/          node:test suite (runs via tsx, no network)
examples/       sdbg (brand adapter) + template (site-profile runtime)
docs/           ADOPTION, CONTENT-SPEC, PROVIDERS, WORKFLOWS
docs/skills/aseo/  the full ASEO operating skill this engine implements
AGENTS.md       entry point for AI agents working in or adopting this repo
.env.example    every env var the engine reads, with comments
```
