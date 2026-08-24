# AGENTS.md — working with the BizRnR Blog Engine

You are an AI agent. This file is your entry point. The repo is deliberately self-contained: you
need no BizRnR-internal system, memory, or credential store to do correct work here.

## Which job are you doing?

| Your task | Go to | Time |
|---|---|---|
| **Add a blog to a site** | [docs/ADOPTION.md](docs/ADOPTION.md) — write an ~80-line adapter | ~1 hour |
| **Run many sites from one service** | [docs/SERVICE.md](docs/SERVICE.md) + `examples/service` | ~1 hour |
| **The site doesn't match the defaults** | The seam table at the end of [docs/ADOPTION.md](docs/ADOPTION.md) — do not fork | minutes |
| **Change what posts contain** | [docs/CONTENT-SPEC.md](docs/CONTENT-SPEC.md) — prompt and validator move together | |
| **Use a different model / infra** | [docs/PROVIDERS.md](docs/PROVIDERS.md) — hooks, not vendor code | |
| **Publishing is broken or stalled** | [docs/WORKFLOWS.md](docs/WORKFLOWS.md) — the gotchas that caused real outages | |
| **Make a site get more traffic** | [docs/TRAFFIC.md](docs/TRAFFIC.md) — ranked by measured return | |
| **Extend the engine itself** | This file, below | |

**The single most useful decision:** if the site can read from a database at render time, use the
Supabase store. Publishing becomes an upsert and every git/CI/token/rebuild failure mode
disappears. If it's a static export, use the filesystem store. Both are first-class.

## Ground rules

- **Verify before claiming done.** `npm run verify` (typecheck + tests + build) must pass. Tests
  run offline — no API keys, no network.
- **`dist/` is committed.** Consumers install from git. Run `npm run build` and commit `dist/`
  with any `src/` change; CI fails on drift.
- **New fields are optional, with production-safe defaults.** Existing adapters pass only
  `{ config, topics, brandPersona }` and must keep working untouched.
- **Prompt and validator move together.** Change what the prompt asks for and you change
  `validateGeneratedPost` and its tests in the same commit, and vice versa.
- **Models cannot count.** Enforce lengths by deterministic clamping (`clampText`), never by
  rejecting a generation on a character count. Parsing must tolerate fences, preambles and stray
  whitespace; a parse failure consumes a retry attempt with feedback rather than aborting.
- **Never weaken the safety rails** without explicit human sign-off: the internal-link allowlist,
  claims discipline, blocked phrases, the watermark invariant, honest dates, and submitting only
  after a URL is live.
- **Check for a seam before writing a workaround.** Frontmatter shape, topic choice, model,
  storage, output format, demand signals and distribution are all seams. A workaround a second
  site would also need belongs in the engine.

## Architecture in one pass

```
adapter (per site: identity, topics, persona)
   │
   ├─ topic-rotation + demand ──→ what to write about
   ├─ generate-post ────────────→ the content contract, validated, retried
   ├─ images ───────────────────→ hero + watermark + OG card + variants
   ├─ store ────────────────────→ WHERE it lands (files | Supabase | yours)
   ├─ indexing + gsc ───────────→ submitted only once live
   └─ audit · scorecard · refresh → measured, then improved
```

`store.ts` is the important abstraction: it is the engine's only route to persisted posts and
assets, so nothing else in the pipeline knows or cares whether a post is a file or a row.

## Extending

- **New output surface** (a schema type, a feed, a card style): add a module under `src/`, export
  it from `src/index.ts`, add tests, add a row to the README module table.
- **New content rule**: add it to `BlogContentRules` (optional, defaulted), wire it into the
  prompt *and* `validateGeneratedPost`, and cover both the accept and reject paths in tests.
- **New provider or storage**: implement the hook or the `BlogStore` interface. Do not add a
  vendor SDK — `supabase-store.ts` is implemented with plain `fetch` for exactly this reason.

## Upkeep

- **Monthly**: `npm outdated`, `npm audit`, re-run `npm run verify`. Patch security advisories
  immediately; adopt majors only with the full suite green.
- **Quarterly**: re-diff `docs/skills/aseo/SKILL.md` against upstream, re-check adopter cron and
  scorecard health, revisit `docs/ROADMAP.md`.
- **The expensive failures are silent ones.** A red cron, a stalled review queue, or a
  never-firing scheduled job cost weeks before anyone noticed. The scorecard exists to surface
  exactly those; keep it running with `--strict`.
