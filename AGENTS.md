# AGENTS.md — working with the blog engine

You are an AI agent. This file is your entry point for reviewing, adopting,
extending, or operating this repo. The repo is deliberately self-contained:
you do not need access to any internal system, memory, or credential store to
do correct work here.

## Plug-and-play in four steps

1. `npm install github:BizrnrAI/blog-engine`
2. Copy [examples/minimal/runtime.ts](examples/minimal/runtime.ts) — the
   smallest complete adapter — and change the strings.
3. `configureBlogEngine(myRuntime())`. It **validates the adapter immediately**
   and throws one error listing every field that is wrong, so you find out at
   config time rather than after a model call. Lint without configuring via
   `validateBlogEngineRuntime(runtime)`.
4. `await generateBlogRun(process.cwd(), { count: 1, dryRun: true, skipPing: true })`
   to preview. A dry run writes nothing to disk.

The engine is **domain-agnostic**: it knows nothing about your industry. A
bakery, a law firm, a SaaS product and a brokerage all drive the same core.
The only required identity is `name`, `siteUrl`, `siteHost`, `agent.name`.

## Orientation (read in this order)

1. [README.md](README.md) — what the engine does, module map, canonical rules.
2. [docs/ADOPTION.md](docs/ADOPTION.md) — wire the engine into a site.
3. [docs/CONTENT-SPEC.md](docs/CONTENT-SPEC.md) — the post contract the
   validator enforces; change prompts and validator together.
4. [docs/PROVIDERS.md](docs/PROVIDERS.md) — model providers, env vars, and the
   hooks for running on your own infrastructure.
5. [docs/WORKFLOWS.md](docs/WORKFLOWS.md) — PR-safe publishing + post-merge
   indexing.
6. [docs/skills/aseo/SKILL.md](docs/skills/aseo/SKILL.md) — the full ASEO
   operating skill (SEO + AEO + GEO) this engine implements the blog slice of.
   Consult it before making any content-policy decision.

## Ground rules

- **Verify before claiming done.** `npm run verify` (typecheck + tests +
  build) must pass. Tests run offline — no API keys needed.
- **Never weaken the safety rails** without explicit human sign-off: the
  internal-link allowlist, claims discipline (no fabricated statistics/prices/
  sources), blocked-phrase checks, the watermark invariant, honest dates, and
  PR-based publishing are non-negotiable (see "Non-negotiable prohibitions" in
  the ASEO skill).
- **Models cannot count characters.** Enforce length limits by deterministic
  clamping in code (`clampText`), never by rejecting a generation attempt on a
  character count. Validation regexes must tolerate bold labels, preambles,
  fences, and stray whitespace. A parse failure must consume a retry attempt
  with structural feedback — never abort the retry loop.
- **Prompt and validator move together.** If you change what the prompt asks
  for, update `validateGeneratedPost` and its tests in the same change, and
  vice versa.
- **Backward compatibility.** Existing site adapters supply only
  `{ config, topics, brandPersona }`. New runtime fields must be optional with
  production-safe defaults.
- **Keep the core domain-agnostic.** Never add an industry assumption to
  `src/` — no vertical-specific categories, keyword regexes, CTA wording, or
  vendor product copy. If a behaviour only makes sense for one kind of site, it
  belongs in that site's adapter (or `content.extraRules` /
  `content.ctaInstruction`), not in the engine. A default that names an
  industry is a bug: it silently breaks every other adopter. The
  `tests/seams.test.ts` agnosticism cases guard this.
- **Fail fast, name the field.** A misconfigured adapter must be rejected by
  `validateBlogEngineRuntime` with a message naming the offending config path —
  never by an undefined read deep in the pipeline.
- **dist/ is committed.** Consumers install from git. Run `npm run build` and
  commit `dist/` with any `src/` change.

## Adopting the engine with your own infrastructure

You don't need OpenRouter or Vercel AI Gateway. Provide `hooks` when calling
`configureBlogEngine`:

- `generateText({ messages, text })` → return the model's raw text (strict
  JSON expected). Point this at any LLM you can call.
- `generateHeroImage({ prompt, post, topic })` → return a raw image `Buffer`
  (the engine watermarks it with the site logo, encodes it, and writes it
  locally) or `null` to use the adapter's curated fallback photos.
- `fetchGscQueries({ property, siteUrl, days })` → return `GscQuery[]` from
  your own Search Console auth (a service account, say) or any other demand
  source. The engine still applies its own filters to whatever you return.
- `submitSitemap({ sitemap, property })` → resubmit the sitemap with that same
  auth. Takes precedence over the built-in OAuth ping and needs no token.
- `renderMarkdown({ post, cover, gradient, dateISO })` → return the finished
  file contents when your site owns a different frontmatter shape (different
  field names, FAQs rendered into the body, extra fields).

Every hook is optional and replaces exactly one dependency. The engine keeps
ownership of the invariants either way — topic filtering, validation,
watermarking, encoding, and the write itself are never delegated.

Set `image.og.enabled: false` when the hero should double as the Open Graph
card instead of generating a second asset per post.

Alternatively keep the built-in providers and set
`config.text.provider = 'openai-compatible'`, `config.text.url` to any
`/chat/completions` endpoint, and `config.text.apiKeyEnv` to your key's env
var. All env vars are listed in [.env.example](.env.example).

## Operating checklist for autonomous publishing

1. Generate on a branch with `--skip-ping` (or `skipPing: true`).
2. Run the site's own build gates (typecheck, build, any ASEO gate) in-run.
3. Open a PR; merge through repo rules — never push generated content to main.
4. After merge, poll the production URL until it returns 200, then submit via
   IndexNow and resubmit the GSC sitemap (`runBlogIndexPublishedCli` does
   this; `--wait-live` handles the polling).
5. GitHub Actions PR creation requires the repo setting
   `default_workflow_permissions=write` and
   `can_approve_pull_request_reviews=true` — a silent failure mode otherwise.

## Extending

- New output surface (e.g. a new schema type, feed, or card style): add a
  module under `src/`, export it from `src/index.ts`, add tests, document it
  in README's module table.
- New content rule: add it to `BlogContentRules` (optional, defaulted), wire
  it into the prompt and `validateGeneratedPost`, cover both accept and
  reject paths in `tests/generate-post.test.ts`.
- New provider: prefer the hook seam over hard-coding another vendor SDK.
