# Content spec — what every generated post must contain and why

This is the contract between the prompt (`buildMessages`) and the validator
(`validateGeneratedPost`) in `src/generate-post.ts`. **They move together**:
never change one without the other and the tests.

The spec distills the blog slice of the full ASEO skill
([docs/skills/aseo/SKILL.md](skills/aseo/SKILL.md)) plus patterns observed in
posts that LLMs actually cite (answer-first structure, parallel comparisons,
transparent scoping, disclosed authorship).

## Post anatomy

| Field | Contract | Why |
|---|---|---|
| `title` | ≤ ~65 chars target (hard fail > 90), keyword/location natural | SERP display; H1 is added by the page |
| `slug` | kebab-case, ≤ 70 chars, unique vs existing posts | Stable canonical URLs |
| `description` | Model aims 120–158 chars; engine **clamps deterministically** to 158 on a word boundary | Models cannot count characters — hard char limits caused 3/3 retry failures in production. Clamp, don't reject |
| `answer` | 40–55 words (accepts 30–70), subject-verb-object, direct | The quick-answer block answer engines extract; render it server-side near the top |
| `readMins` | 5–9 (clamped 3–15) | Honest read-time signal |
| `tags` | 3–6 lowercase topical tags, deduped, no brand names | Related-post linking, keywords in JSON-LD |
| `heroImageAlt` | 8–16 words literally describing the photographic scene | Descriptive alt beats keyword stuffing; engine prefixes the brand (`Brand – scene`) so alts are branded but never identical across posts |
| `faqs` | exactly 3, each question phrased as a real user search, answers 2–4 factual sentences | On-page `<details>` + `FAQPage` JSON-LD; captures long-tail question queries |
| `body` | see below | |

## Body contract

1. **Answer-first lede** — 2–3 sentences resolving the core question
   immediately. No "in this article", no throat-clearing.
2. **4–6 H2 sections**, no H1, 700–1100 words total (validator floor: 450).
3. **≥ 2 question-phrased H2s** ending in `?`, each opening with a direct
   40–60-word answer paragraph before elaborating. This mirrors how People
   Also Ask and AI answer engines chunk content: heading = query,
   first paragraph = extractable answer.
4. **Exactly one citable blockquote** (`> `), 80–140 words (validator accepts
   50–200), self-contained with explicit scope and the timeframe
   "as of <month year>". No dangling pronouns, no "as above". This is the
   passage an AI assistant can quote verbatim with attribution — give it one
   obvious candidate.
5. **Tables/lists over prose** wherever the content compares options, steps,
   or trade-offs. Parallel, scannable structure is what gets extracted.
6. **2–4 internal links** chosen only from the adapter's `internalLinks`
   allowlist. The validator rejects any relative link outside the list —
   models otherwise invent plausible-but-404 paths.
7. **Voice CTA close** — final paragraph invites the reader to speak with the
   site's voice agent, linking the configured CTA path. Never a form.
8. **No FAQ or quick-answer section in the body** — both render from the JSON
   fields; duplicating them creates competing extractable blocks.
9. Cross-promo posts (every `crossPromoEvery`-th) additionally include one
   natural contextual link to the configured BizRnR deep link.

## Claims discipline (non-negotiable)

- Never fabricate prices, percentages, statistics, dates, interest rates,
  review counts, awards, or named sources. Qualitative language and general
  ranges only, unless the adapter supplies verified facts through the persona.
- No legal/tax/medical/financial guarantees or advice; direct readers to the
  appropriate professional.
- Sites can enforce a `content.blockedPhrases` list (case-insensitive) —
  validation fails if any appears anywhere in the post. Mirror the phrases
  your site's claims registry blocks.
- Honest dates only: `date`/`updated` are the real generation date; never
  backdate, never fake-freshen.

## Validation behavior (for engine maintainers)

- Three attempts; each failure feeds the exact error list back to the model.
- A JSON parse failure **consumes an attempt** with structural feedback and
  logs a 200-char head of the raw output — it must never throw past the loop.
- Tolerant parsing: strips code fences, preambles, and trailing prose before
  `JSON.parse`.
- Deterministic normalization before validation: description clamping, tag
  dedup/lowercase, whitespace trims, slug re-derivation via `slugify`.
- All thresholds are per-site tunable through `BlogContentRules`; defaults are
  the production-proven values above.

## Image contract

- Hero: AI-generated photorealistic scene from the title/topic (no text, no
  logos, no people holding signs), watermarked with the site's own logo
  (bottom-right, configurable width/opacity/margin), stored locally under
  `paths.heroDir`, encoded in the configured format. If generation is
  unavailable, a curated local fallback photo with its own descriptive alt is
  used — never a hotlinked stock image.
- OG card: deterministic branded 1200×630 SVG→JPEG with logo, category,
  wrapped title, and site footer, stored under `paths.assetDir`. Every post
  has one regardless of hero source.
- Both surfaces ship in the RSS feed as `media:content` + `enclosure` with
  correct MIME type and real byte length.
