# How to measure blog search and citation performance

## Verify delivery and discovery

- Track the number of UTC dates with a new published article. The scorecard's
  `--cadence-days=1 --strict` check reports gaps across the last seven complete UTC dates.
- Verify the newest article renders its answer in readable HTML, links to its own canonical URL,
  and appears in a configured sitemap. Check robots rules against the actual article paths and
  confirm the CDN permits the search crawlers your site intends to serve.
- Compare index coverage over a pinned URL group with `--index-slugs=a,b,c`. Use the site's Search
  Console OAuth credentials or `hooks.inspectUrl`. A sitemap receipt and IndexNow acceptance
  describe submission. URL Inspection describes observed Google index state.
  [Google recrawling guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl).

## Develop topics and improve existing pages

- Use nonbrand search and site data to find specific reader questions. Publish original evidence
  and clear practical guidance. Link from the blog hub, relevant articles, and owner pages using
  descriptive anchors. Keep a varied editorial queue and enable `content.requireFreshTopic`.
  [Google people-first content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).
- Compare finalized Search Console windows and measure impressions, clicks, and conversions.
  Rank rescue surfaces URLs at positions 8–30 as candidates. Review overlapping queries when two
  pages earn impressions. Decide whether to consolidate or sharpen their distinct intent.
- Record accurate public dates. Reserve `lastmod` for substantive edits and leave it unset when
  unknown. Old evergreen articles can remain useful without rewriting.
  [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

## Measure citations

- Use stable grounded prompts and record the provider, model, time, and exact cited URL. The
  scorecard reports links to known blog pages and brand mentions separately.
- Compare these samples with actual citations in Bing Webmaster Tools and with referral traffic in
  analytics. Use the available source or referral attribution for ChatGPT.
  [Bing AI Performance](https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/),
  [ChatGPT Search](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt).

See the [November 2026 audit](AUDIT-2026-11.md) for platform guidance, live adopter observations,
and deployment acceptance checks.
