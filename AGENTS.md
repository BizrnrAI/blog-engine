# AGENTS.md — working with the BizRnR Blog Engine

You are an AI agent. This file is your entry point for reviewing, adopting,
extending, or operating this repo. The repo is deliberately self-contained:
you do not need access to any BizRnR-internal system, memory, or credential
store to do correct work here.

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
