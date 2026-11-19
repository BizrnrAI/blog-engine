# Workflows: direct database publishing

A website checks its own schedule and publishing limits, then invokes the engine. The engine
validates content and writes the post and generated assets to Supabase, directly or through its
authorized AllWeb gateway. It never opens a blog-content PR. Website code changes still follow
the repository's normal review and deployment process.

```text
website scheduler and policy
  -> model generation and validation
  -> asset store and published post row
  -> website reads current Supabase content
  -> verify canonical article HTTP 200
  -> IndexNow and configured GSC sitemaps
```

## Stamp the website's workflow

```ts
import { blogGenerateWorkflow, blogRefreshWorkflow, blogIndexingWorkflow } from '@bizrnr/blog-engine/core';

writeFileSync('.github/workflows/blog-generate.yml', blogGenerateWorkflow({
  generateCron: '23 15 * * *', // example site-owned daily primary trigger (UTC)
  dailyTarget: 1,
  generateCommand: 'npm run blog:generate -- --count="$BLOG_COUNT" --skip-ping',
}));
writeFileSync('.github/workflows/blog-refresh.yml', blogRefreshWorkflow({
  refreshCron: websitePolicy.refreshCron,
}));
writeFileSync('.github/workflows/blog-indexing.yml', blogIndexingWorkflow());
```

Cron options are supplied by the website. Omit them for dispatch-only or an external scheduler.
The workflow has `contents: read`, shared per-repository publishing concurrency, no git writes,
no PR token, and no content build/merge step. Inputs enter commands through environment variables.
`BLOG_REQUIRE_REMOTE_STORE=1` makes canonical generation/refresh CLIs reject a filesystem or
`persistPost` fallback and require the store's published status.

The daily target counts new published rows on the UTC date. A same-day retry generates only
the remaining number. Run the generator from one scheduler per site, or share a distributed lock
across scheduler replicas. An optional second run later in the same UTC day can recover a missed
or failed primary trigger. Run the health check with `--cadence-days=1 --strict` to flag missed days.
Keep review-required sites on their accountable release path.

The adapter must actually supply a remote store. Providing credentials alone does not select one.
For AllWeb, use the existing least-privilege launcher and scoped credentials. A gateway that
requires review must be explicitly reconfigured by its authorized operator before autonomous
publication can succeed; this engine does not bypass that permission boundary.

## Indexing retries

Generation and refresh emit the saved slugs to `GITHUB_OUTPUT`; the same job passes them to the
index CLI. The separate indexing workflow accepts stored slugs for retries. It never infers posts
from commits or assumes that a merge deploy happened. A failed indexing run does not require
regenerating the article. Retry indexing for the already-persisted slugs.

Run `npm run blog:index -- --slugs=a,b` to retry known saved rows. If an interrupted job lost
its slug output, run `npm run blog:index -- --recent-days=2` or select `recent_days` on the generated
indexing workflow. That recovery mode reads the configured store, accepts one to seven UTC days
of published changes, and leaves syndication off. Use exact slugs whenever available.

Live verification requires HTTP 200 without a redirect and rejects explicit noindex or conflicting
canonicals. Enable `indexing.requireCanonicalHtml` to require the self-canonical HTML link and check
the rendered article against the store. Let the site invalidate its public article, hub, feed, and
sitemap caches at publication or release. The engine waits up to 60 seconds by default.

IndexNow and Search Console submissions run independently. The report distinguishes skipped
providers, accepted sitemaps, and an IndexNow key still awaiting validation. Use the scorecard,
Search Console URL Inspection, and Bing Webmaster Tools to observe coverage after submission.

## Existing sites

Replacing the shared engine does not change a previously stamped workflow or a vendored generator.
Remove its content PR step, PR token usage, and git-based pending-post deduplication. Read the
published corpus from Supabase for topic selection. Backfill published posts and resolve pending
content PRs before turning on the replacement job. See [UPGRADE-V2.md](UPGRADE-V2.md).

Dynamic websites need current database reads or explicit cache invalidation. Static-export websites
must fetch a Supabase snapshot during their normal deploy, or provide a server-rendered blog. Do
not turn on direct publication while the public website still reads only committed Markdown.
