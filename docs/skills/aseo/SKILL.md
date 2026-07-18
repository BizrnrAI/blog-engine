---
name: aseo
description: Design, audit, implement, and operate modular evidence-first website architecture for Search Engine Optimization (SEO), Answer Engine Optimization (AEO), and Generative Engine Optimization (GEO). Use for public-site information architecture, canonical query ownership, technical indexing, structured data, citable content and datasets, blogs, comparison pages, AI-retrieval access, grounded citation monitoring, authority development, organic/AI attribution, daily scorecards, rank rescue, or full-site ASEO quality gates.
---

# ASEO

ASEO is one operating system for SEO, AEO, and GEO. Build a coherent site that search engines can crawl and rank, answer engines can extract, generative systems can verify and cite, and people can trust and convert on.

Traffic, citations, and conversions are outcomes. Page count, schema count, crawler visits, submissions, and successful jobs are inputs or diagnostics—not success.

## Principles

1. Establish measurement truth before optimizing.
2. Give each query family one canonical owner; improve it instead of publishing a competitor.
3. Put useful, evidence-backed answers in server-rendered HTML.
4. Score Search SEO and AI Visibility separately; measure Lighthouse separately from both.
5. Prefer fewer authoritative pages over programmatic expansion.
6. Make every factual claim traceable; unsupported claims block publication.
7. Keep visible copy, metadata, schema, feeds, sitemaps, datasets, and AI context coherent.
8. Automate deterministic work; review editorial, redirect, legal, outreach-send, and destructive work.
9. Re-run the exact failed assertion after every fix.
10. Evaluate 7-day and 28-day outcomes, not same-day noise.

## Required architecture

Create or locate these source-of-truth modules before scaling content:

- `site-config`: production origin, preferred hostname, locale, organization identity, environments.
- `route-registry`: canonical URL, profile, intent, indexability, lifecycle state.
- `query-ownership`: normalized query family → canonical path, intent, status, review date.
- `entity-registry`: stable IDs and facts for organizations, products, people, places, and offers.
- `claim-registry`: verified claims, sources, scope, dates, method, sample size, limitations, expiry.
- `metadata-builder` and `schema-builders`: centralized, registry-driven emitters.
- `page-profiles`: profile-specific Search SEO and AI Visibility requirements.
- `sitemap-eligibility`: one predicate shared by robots, sitemaps, feeds, and discovery.
- `redirect-registry`: retired alias → direct permanent destination; no chains.
- `ASEO contract baseline`: production metadata, headings, schema types, links, render state.
- `daily-scorecard`: one aggregation layer shared by dashboard and notification report.

Use framework-native locations. Never redeclare registry facts in route files.

## Execution order

1. Inventory routes, rendered HTML, sitemaps, redirects, analytics, conversions, claims, and content.
2. Repair source health and capture a fixed 28-day baseline.
3. Define page profiles, URL taxonomy, query owners, redirects, and eligibility.
4. Centralize metadata, entities, claims, schema, citations, and review dates.
5. Repair crawl/index state, pre-JavaScript rendering, links, accessibility, and performance.
6. Improve priority owners using measured demand, rank opportunities, and citation gaps.
7. Audit and quarantine the blog corpus before adding posts.
8. Add grounded citation, authority, rank-rescue, and evidence-freshness loops.
9. Attribute organic/AI landings through revenue and retained-customer outcomes.
10. Deploy reversible layers and verify production before dependent work.

## URL and ownership contract

Use stable, intent-led nouns:

| Purpose | Pattern | Rule |
|---|---|---|
| Homepage | `/` | Brand/navigation; do not make it own every query. |
| Product | `/products/{product}` | One substantial owner per product/category; a stable top-level slug is valid for a single-product site. |
| Industry fit | `/industries/{vertical}` | Explain fit; do not duplicate a best-of page. |
| Best hub | `/best/{category}` | Substantial parent for recommendations. |
| Best by vertical | `/best/{category}/{vertical}` | Conditional profession/use-case shortlist. |
| Alternatives | `/best/alternatives/{provider}` | One owner per provider plus a useful parent hub. |
| Head-to-head | `/compare/{a}-vs-{b}` | Only for genuine two-product intent. |
| Answer | `/answers/{question}` | Support, never compete with, the commercial owner. |
| Guide | `/guides/{topic}` | Evergreen educational support. |
| Research | `/research/{asset}` | Methods, evidence, datasets, citation packages. |
| Editorial | `/blog/{slug}` | Dated support; not a duplicate owner. |
| Entity | `/authors/{person}` | Verifiable identity, expertise, work. |
| Integration | `/integrations/{integration}` | Only reviewed, available integrations. |
| Local | `/locations/{place}/{service}` | Index only with real presence/relevance, unique evidence, and demand. |
| Campaign | `/lp/{campaign}` | `noindex` unless explicitly approved as an owner. |

Require a useful indexable hub before indexable children. Folder depth alone has no ranking value.

Store ownership as:

```text
QueryOwner { queryFamily, canonicalPath, intent, pageProfile,
             status: reviewed | proposed | retired, rationale, reviewedAt }
```

Classify intent as `discover`, `evaluate`, `convert`, `navigate`, `support`, or `local`. Merge variants when their answer and conversion action are materially identical. Detect cannibalization when one normalized query earns at least 10 impressions on two or more URLs; propose ownership, differentiation, consolidation, or redirect. Review merges and redirects.

Before creating a URL, require two independent demand sources, distinct intent, no suitable owner, useful information gain or evidence, planned incoming/internal links, and ability to pass all gates. Otherwise refresh an owner or add a supporting passage.

When a canonical moves, permanently redirect all aliases directly to the final owner. Remove aliases from sitemaps, feeds, canonicals, AI context, navigation, and new links. Test status, destination, robots, canonical, sitemap exclusion, and chains; request supported recrawl only after production verification.

## Page profiles and contracts

Classify routes as homepage; product; industry; comparison; answer; research; article; author; hub/taxonomy; integration; local; trust/help; campaign; private/utility/API; or redirect/error. Audit indexable HTML from the sitemap, not every compiled route.

Every indexable HTML page requires:

- HTTP 200, index/follow, one production self-canonical, and correct sitemap inclusion.
- Unique useful title/description, one H1, logical headings, and meaningful main content.
- Server-rendered primary content, mobile usability, accessible semantics, resilient interaction, no critical console error.
- Breadcrumbs where hierarchical, relevant internal links, valid media/alt/dimensions, Open Graph/social metadata.
- Accurate profile-specific JSON-LD matching visible content.
- Real publish, modification, verification, or review dates—never false `now()` freshness.
- Stable entities, visible sources, accountable authorship/review, limitations when material.
- Attribution and conversion events on applicable CTAs/forms.

Answer-intent profiles also need a natural question heading, a 40–60 word direct answer, and a self-contained citable passage of roughly 134–167 words with facts, units, scope, dates, sources, and no unresolved “as above” references. Length is guidance, not a reason to harm clarity. Keep citation-critical content visible before JavaScript and outside reveal logic that can remain hidden.

## Evidence, claims, and entities

Implement:

```text
Source { id, url, publisher, title, sourceType, publishedAt,
         accessedAt, trustClass, primary, status }
Claim  { id, text, claimType, scope, sourceIds, observedAt,
         verifiedAt, sampleSize, method, limitations, expiresAt, status }
```

Use `TRUSTED`, `CAUTIOUS`, and `UNTRUSTED`. Prefer primary documentation, public records, peer-reviewed work, and reproducible first-party aggregates. Vendor documentation can prove vendor facts, not independent awards or market superiority.

Every number needs a trusted URL or reproducible aggregate with observation date, population, sample size, method, and limitations. For original research:

- Publish method, limitations, window, and non-cherry-picked results.
- Offer accessible HTML plus JSON and CSV.
- Add matching `Dataset` JSON-LD and a “cite this research” block.
- Reuse stable claim/source IDs across HTML, schema, data, and AI context.
- Default to at least 30 observations per published segment; preserve the prior dated value when underpowered.
- Apply documented expiry to mutable provider facts and benchmarks.

Block unsupported statistics, savings, outcomes, testimonials, awards, rankings, customer stories, compliance, and integration claims. Never infer a case study from operational records. Require consented evidence for customer outcomes and quotations. On regulated subjects, state boundaries precisely; do not imply professional advice, completed review, protected relationships, guaranteed compliance, or replacement of required human judgment without authoritative proof.

Run contradiction/parity checks across visible pages, metadata, schema, pricing, datasets, feeds, `llms.txt`, AI-context pages, and prompts.

Build one JSON-LD graph per page via centralized builders and stable `@id`s. Typical mappings: root → `Organization`/`WebSite`; product → `Product` or `SoftwareApplication` plus valid `Offer`; service → `Service`; article → `Article`/`BlogPosting` plus `Person`; comparison → `WebPage`/`ItemList`; research → `Dataset`/`Article`; author → `ProfilePage`/`Person`; hub → `CollectionPage`/`ItemList`; real eligible local presence → appropriate `LocalBusiness`/`Service`. Add breadcrumbs where useful. Validate syntax, eligibility, entity IDs, and visible-copy parity.

Never emit review/rating schema from synthetic reviews, private testimonials, or unsupported aggregates. Do not mark competitors as the publisher's products to gain rich results.

## Content systems

### Comparisons

Vendor-authored comparisons may rank or be cited, but are not independent validation. Require a conditional answer; shortlist; operating-model distinctions; comparable table with units, unknowns, and limits; best-for/not-for; setup, integration, pricing-unit, and support guidance; transparent arithmetic; one current primary-source record per provider; author/editor, review date, method, sources, FAQs, and fan-out answers. Prohibit unexplained self-ranking scores, invented awards, guaranteed savings, and copied wording. Make ownership clear through normal identity/bylines; add a special disclosure only when legally required or materially useful.

### Blog

Audit every article for owner, intent, useful word count, author, dates, sources, retired claims, links, search performance, index state, and verdict:

- `SHIP`: distinct, useful, sourced, accountable, current, technically valid.
- `FIX`: recoverable evidence, freshness, differentiation, link, or metadata gaps.
- `BLOCK`: thin/duplicate, unsafe, materially unsupported, fabricated, or contradictory.

Keep blocked legacy pages `noindex` when reachability is needed; remove them from sitemaps, feeds, taxonomies, recommendations, and auto-links. Do not disguise automated rewrites as human review.

Default autonomous publishing requires two independent demand signals, revenue intent ≥1, no owner, `SHIP`, trusted sources, claim-level evidence, accountable author/reviewer, and original contribution. Cap new search-led posts at two per rolling seven days until reviewed evidence supports more. If an owner exists, queue a refresh. Prioritize up to five weekly refreshes using search impressions/clicks, near-page-one position, citation gaps, conversions, and stale evidence—not server views. Keep archive pagination crawlable; prevent thin tag/category proliferation.

### Query fan-out

Mine Search Console, People Also Ask, autocomplete question modifiers, forums/community language, ranking/cited pages, grounded-provider answers/citations, and safely aggregated sales/support/on-site search. Normalize, deduplicate, classify intent, count independent-source frequency, and prioritize revenue relevance plus information gain. Add gaps to an owner or genuinely distinct support page—never one thin URL per question.

## Retrieval and AI visibility

Before AEO scoring:

- Maintain current provider-documented retrieval/citation crawlers separately from training crawlers.
- Allow intended retrieval crawlers on citation pages unless policy says otherwise.
- Test robots, WAF/CDN, status, rate limits, canonical, and pre-JavaScript content per user agent.
- Treat retrieval blocking as a platform-specific critical failure; do not equate training access with retrieval.

Treat `llms.txt`, expanded AI context, and open-in-assistant buttons as optional context/UX surfaces. Give `llms.txt` zero ranking weight and enforce claim parity. Assistant prompts may ask the model to inspect the site, explain fit, verify facts/limits, and ask user questions; never instruct it to recommend the publisher.

Normalize grounded checks:

```text
CitationProbe { provider, probeType, available, mentioned, answerExcerpt,
                citedUrls, model, checkedAt, errorCode, responseHash, runId }
```

Use independently labeled grounded-web adapters. Missing credentials, disabled spend, non-2xx, parse failure, or unavailable grounding means `available:false`, never “not cited.” Label web-search proxies and exclude them from grounded denominators. Count a mention only when the answer names the tracked entity or cites an owned canonical domain.

Run a weekly complete sweep and a small daily health sweep when cost/terms permit. Expected rows = queries × available providers. Alert below 90% completion; warn below 100%. Create a gap only after absence on at least two available providers for two consecutive complete sweeps. If an owner exists, create a refresh/authority opportunity, not a duplicate.

## Technical foundation

Enforce one HTTPS hostname; direct alias redirects; production-safe robots and blocked staging; sitemaps containing only canonical indexable 200 URLs; shared robots/sitemap eligibility; correct canonical, locale, pagination, and feeds; server-rendered HTML; responsive media, caching, compression, font discipline; semantic accessibility; and a production ASEO contract detecting status, robots, canonical, title/H1, schema-type, content, and link drift.

Reject canonical-to-homepage shortcuts, sitemap `noindex` URLs, soft 404s, redirect chains, orphans, and contradictory signals.

Use sitemaps and Search Console inspection for normal Google pages. Use IndexNow only for participating engines. Submission is not discovery, crawl, indexing, rank, or citation; report each state separately. Do not use Google's specialized Indexing API for ordinary pages.

## Authority and distribution

Track:

```text
AuthorityOpportunity { sourceUrl, domain, type, query, serpPosition,
  targetPath, contactPage, trustClass, status, draftSubject, draftBody,
  discoveredAt, checkedAt, liveUrl, linkAttributes, metadata }
```

Statuses: `discovered`, `drafted`, `human_ready`, `submitted`, `live`, `rejected`, `stale`.

Discover relevant roundups, editorials, journalist requests, legitimate directories, associations, resources, and communities from priority SERPs. Inspect via SSRF-safe fetch. Exclude owned sites, link farms, low-trust/irrelevant directories, and duplicates; match each opportunity to an owner.

Generate personalized drafts only from verified claims. Require human approval before editor email, profile claim, community post, paid placement, or link purchase. Never automate reciprocal networks, spam, fake reviews, or undisclosed paid links. Mark `live` only after delivered HTML confirms the mention/link; record `nofollow`/`sponsored` without treating them as failure. Measure relevant independent referring domains and conversions, not backlink count.

Keep organization identity and profiles consistent. Request reviews only from eligible real users, with no incentive or requested rating, and prevent duplicate requests.

## Measurement and rank rescue

Prefer free first-party sources: Search Console, Bing Webmaster Tools, GA4 or privacy-respecting analytics, server/CDN logs, application/payment events, and manually verified outputs. Paid tools are optional.

Store daily page/query metrics; index/crawl state; page-profile checks with pass/fail/N/A/needs-API evidence; citation probes/state/velocity; authority opportunities/referring domains; evidence freshness/contradictions; corpus verdicts/actions; source health; and landing-page conversions from visit/CTA/demo through registration, verification, checkout, paid, provisioned, and retained/active customer.

Use least-privilege service storage, row-level security where supported, revoked public access, reporting indexes, redacted errors, and idempotent writes. Centralize credential discovery. Missing/non-2xx sources are unavailable. Alert when search reports clicks but trusted analytics reports zero sessions; never call contradictory `0/0` trusted.

Persist non-PII first/last-touch source, medium, campaign, click IDs, landing page, and experiment assignment through authentication and the primary business outcome.

Run rank rescue after daily page/query collection. Default eligibility: ≥25 impressions over 28 days and an indexable owner.

```text
score = impressions × intentWeight × positionMultiplier × zeroClickMultiplier
intent: convert=3, evaluate=2, discover=1
position: 8–30=2; 31–60=1; >60=0.5;
          <8 and CTR<1%=1.5; otherwise=1
zero clicks: 1.5; otherwise=1
```

Classify: position 8–30 → on-page refresh plus authority; 31–60 → authority-first, no new page; >60 → relevance/intent/index/link audit; <8 with CTR<1% → title/description experiment proposal. Limit each cycle to five high-confidence actions with hypothesis, owner, failed assertion, leading indicator, and evaluation window.

## Daily control center

Use one aggregator for dashboard and concise notification. Collect before reporting. Show:

1. Operations: availability, failures, stale evidence, crawl/index issues, sweep completeness.
2. Leading indicators: non-brand clicks, impressions, CTR, position, indexed owners, AI referrals/retrieval, grounded citations, independent domains, authority states.
3. Outcomes: registrations, checkouts, revenue, retained/active customers attributed to organic/AI landings.
4. Completed work and five smallest highest-impact next actions.

Show today, 7-day, 28-day, and fixed baseline where valid. Missing = `N/A`, never zero. Link to detail. Run search/index/rank/evidence/core-retrieval/report daily; grounded sweep, corpus refresh, authority, full reachability weekly; evidence telemetry, ownership, entity consistency, conversion cohorts, and page pruning monthly.

## Safe autonomy, scoring, and release

- `AUTO`: deterministic registry-driven canonical, robots, schema reference, eligibility, safe link, image dimensions, reviewed metadata parity.
- `PROPOSED`: title/description experiments, answer restructuring, meaningful alt text, fan-out, comparison, content refresh.
- `ADVISORY`: redirect/merge/delete, legal claims, performance architecture, outreach sends, profile claims, paid placement, programmatic expansion.

Auditors remain read-only; one writer applies changes. Refuse dirty worktrees, leaked secrets, fabricated evidence, or silent scope expansion. Hold editorial/attribution work for review and rerun the exact assertion.

Score sitemap HTML on independent axes:

| Search SEO (100) | Points | AI Visibility (100) | Points |
|---|---:|---|---:|
| Crawl/index/canonical/sitemap | 25 | Retrieval access/pre-JS render | 20 |
| Intent/content/headings/metadata | 20 | Answer/passage extractability | 20 |
| Internal discovery/hierarchy | 10 | Claims/factual density | 20 |
| Schema/entity accuracy | 15 | Entity/authorship | 15 |
| Evidence/trust/freshness | 15 | Schema/machine parity | 10 |
| Render/mobile/accessibility/media | 15 | Freshness/limits/source quality | 10 |
|  |  | Fan-out coverage | 5 |

Exclude genuine `not_applicable` and `needs_api` checks from both numerator and denominator; report counts as confidence. Never convert unavailable checks to passes. Site-wide `noindex`, global robots block, canonical/index conflict, or retrieval block caps the affected axis at 40.

`A` = 90–100 with no critical failure. `100/A` = all applicable assertions pass with honest API evidence. `A+` = Search SEO 100, AI Visibility 100, and separately measured production Lighthouse Performance, Accessibility, Best Practices, and SEO all 100 for the stated profile. Never infer A+ from code or a route sample. Scores indicate readiness, not promised rank/citation.

Verify registry/ownership/aliases; sitemap/robots parity; orphaning; page-profile metadata/content/media/accessibility; schema parity/IDs; pre-JS retrieval; claims/expiry/data/math/contradictions; blog and publication gates; failure states/idempotency/security/row assertions; attribution persistence; production Lighthouse/CWV; and ASEO contract drift.

Deploy one coherent layer at a time. Verify production HTML, status, schema, sitemap, robots, redirects, events, rows, and alerts. Rebaseline intentional contract changes in the same review. Observe one successful scheduled run before depending on a job.

## Non-negotiable prohibitions

Never create thin/doorway pages, publish against an existing owner, hide crawler-only answers, treat schema/`llms.txt` as magic, call a proxy grounded, score unavailable providers as failures, call submission indexing, fabricate evidence or expertise, emit unsupported review schema, copy competitor wording/numbers, autonomously send outreach/buy links/post promotions, allow machine-visible contradictions, or grade intentional private/noindex/API/redirect routes as articles.

## Definition of done

ASEO is operational when every route has a profile/intent/state; every material query has one owner; sitemap/robots/canonicals/feeds/links/redirects agree; indexable pages pass honest dual-axis contracts; priority answers render pre-JavaScript and retrieval crawlers can reach them; claims are sourced, current, scoped, reproducible, and coherent; blog decisions use demand/ownership/evidence/performance; search, citations, authority, attribution, and outcomes report daily; unavailable sources are N/A and failures alert; production verification passes; and one report identifies the next highest-impact action.

Update this skill only when measured results establish a durable method, standards/interfaces change, a source is retired, or a new failure mode is proven—not from one noisy day.
