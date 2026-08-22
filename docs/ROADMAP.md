# Roadmap — maximum reach and traffic for any adopter

How the engine should evolve so that *every* platform adopting it gets the most
discovery, citation, and qualified traffic the ASEO method can deliver. Derived
from [the ASEO skill](skills/aseo/SKILL.md), the August 2026 audit, and what is
measurably working on the production adopters.

## Operating principles (non-negotiable, from the skill)

1. Measurement truth before optimization; evaluate on 7- and 28-day windows.
2. One canonical owner per query family — posts support owners, never compete.
3. Useful, evidence-backed answers in server-rendered HTML; unsupported claims
   block publication.
4. Fewer authoritative pages beat programmatic expansion.
5. Visible copy, metadata, schema, feeds, sitemaps, and AI context stay
   coherent — parity by construction, not by review.
6. Submission ≠ indexing ≠ ranking ≠ citation; report each state separately.

## Tier 0 — already in the engine (turn it on)

`identity.author` (stable `#person`), `topics.ownerPages`,
`content.maxPostsPerWeek`, `content.blockedPhrases`, question-led H2s,
120–160-word citable passage, model-written branded alt + dimensions, FAQPage
+ BlogPosting + Breadcrumb graph, speakable (opt-in), RSS with media, sitemap
+ `llms.txt` helpers, IndexNow only after the URL is live. A site that uses all
of these plus a server-rendered template is already ahead of most blogs.

## Tier 1 — next engine releases (content quality & ownership)

| Capability | Shape | Why it moves traffic |
|---|---|---|
| **Refresh mode** | `generateBlogRun(root, { mode: 'refresh', slug })` — re-generate body sections for an existing post using its GSC query set, keep slug/date, bump `updated` honestly | Skill: prioritize ≤5 weekly refreshes of posts at position 8–30 over new posts; it's the highest-ROI action in the rank-rescue model |
| **Two-signal demand gate** | `hooks.fetchDemandSignals` returning normalized queries from a second source (PAA/autocomplete, site search, support logs); `pickTopic` requires GSC *and* one more source for `type:'gsc'` topics | Skill requires two independent demand signals before a new URL; kills low-intent topics |
| **Fan-out into owners** | `generateFanoutPassages(ownerPath, questions)` → FAQ/answer blocks to append to owner pages instead of new posts | Keeps one owner per query; raises owner extractability |
| **Sources & claims** | optional `sources[]` in the post JSON (url, publisher, accessedAt) rendered as a visible "Sources" block + `citation` in schema; `hooks.verifyClaim` to gate numbers | Factual density + traceable claims are 20/100 of the AI-visibility axis |
| **Internal link graph** | `relatedPosts(post, posts)` by tag/category overlap; hub-link requirement (post → category hub → owner) | Discovery/hierarchy points; no orphans |
| **Schema completeness** | `inLanguage`, `wordCount`, `about`/`mentions` entities from tags, author `ProfilePage` builder, `isPartOf` → Blog/WebSite `@id` | Entity/authorship 15/100 of AI axis |
| **Image pipeline** | responsive variants (e.g. 1536/1024/640 + AVIF), `srcset` helper, ≥1200px hero kept for Discover | CWV + Google Discover eligibility (`max-image-preview:large`) |
| **Locale** | `identity.locale` (default `en-US`) flowing into RSS `language`, schema `inLanguage`, date formatting | Correct for non-US adopters |

## Tier 2 — measurement loop (so optimization is evidence-led)

- **`blog:audit` CLI** — runs the skill's corpus verdict on every post:
  owner/intent, word count, author, dates, sources, links, index state (via
  GSC URL inspection hook), performance → `SHIP / FIX / BLOCK` with actions;
  `BLOCK` posts are proposed for `noindex` + removal from sitemap/feed.
- **Storage schemas** exported as types: `CitationProbe`, `QueryOwner`,
  `AuthorityOpportunity`, daily page/query metrics — adopters persist them in
  whatever store they run (Supabase, SQLite, files).
- **Grounded citation probes** — adapter interface for ChatGPT/Perplexity/
  Gemini/Claude grounded checks; `available:false` never counts as "not
  cited"; gaps only after two consecutive complete sweeps.
- **Scorecard** — one aggregator emitting ops (red crons, stale evidence),
  leading indicators (non-brand clicks, impressions, CTR, position, indexed
  owners, citations, referring domains), outcomes (conversions attributed to
  organic/AI landings), and the five smallest highest-impact next actions.
  Delivered as JSON + a Slack/email line. This is what would have caught the
  SDBG outage in a day.

## Tier 3 — distribution (reach beyond the crawl)

- Post-merge **syndication hooks** (`hooks.afterPublish`) with built-in
  adapters: LinkedIn page post, X hook + link, Google Business Profile post,
  newsletter/RSS-to-email, Medium/Substack canonical republish. Never block
  publish on a syndication failure.
- **Google News / Publisher Center** readiness: feed item requirements,
  `NewsArticle` where appropriate, section feeds.
- **Google Discover**: large hero (≥1200px), `max-image-preview:large`, honest
  dates, entity-rich titles — mostly Tier 1 image work.
- **IndexNow + Bing Webmaster** parity; Yandex/Naver where relevant.
- **Retrieval crawlers**: documented `robots.txt` allowances for citation
  crawlers (e.g. GPTBot, ClaudeBot, PerplexityBot, Google-Extended policy kept
  separate from training access) and a reachability check in `blog:audit`.

## Tier 4 — platform checklist for adopters (template-level reach)

Every adopting site should pass this before scaling posts:

1. Server-rendered post HTML (answer block, citable passage, FAQs visible
   pre-JS); no critical console errors; mobile CWV green.
2. Useful indexable blog hub, crawlable pagination, no thin tag pages.
3. One H1, unique title/description, self-canonical, breadcrumbs, explicit
   image dimensions, branded descriptive alt.
4. Author page (`/authors/{person}` or `#person` entity) with verifiable
   identity; publisher `Organization` with logo.
5. `/blog/feed.xml` linked from `<head>` and `llms.txt`; sitemap `lastmod` from
   `updated`; robots allow retrieval crawlers.
6. Owner pages exist for commercial queries *before* supporting posts.
7. Workflow: PR-gated publishing, post-merge pings, failure alerts, cadence cap.
8. Conversion events on post CTAs so traffic can be attributed to outcomes.

## KPIs and review cadence

- Leading: non-brand clicks, impressions, CTR, average position, indexed
  owners, grounded citations, independent referring domains.
- Outcome: conversions/revenue attributed to organic + AI landings.
- Windows: today / 7-day / 28-day / fixed baseline; missing = `N/A`, never 0.
- Review: weekly scorecard, monthly corpus refresh picks, quarterly skill
  re-diff + engine audit.

## Never (anti-patterns the engine must keep refusing)

Thin/doorway posts, publishing against an existing owner, crawler-only
answers, schema/`llms.txt` as magic, fabricated statistics or expertise,
review/rating schema from unsupported data, copied competitor wording,
autonomous outreach/link buying, backdated or fake-freshened dates, and
calling a submission "indexed".
