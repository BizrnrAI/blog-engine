# v2 adoption and rollout

The publication contract changed: content goes directly to Supabase. Weekly caps were removed
from the shared engine at the owner's direction. Each website owns its schedule, requested count,
volume limits, concurrency, and any evidence/review policy. The engine keeps the content validators.

## Publisher

1. Pin the reviewed v2 tag or exact commit in the actual website/service lockfile.
2. Supply `createSupabaseStore` in `hooks.store`, or retain the authorized `createAllWebStore`
   gateway that writes Supabase on the website's behalf. Do not change project or tenant IDs.
3. For direct Supabase deployments, apply `sql/0001_blog_posts.sql`, then
   `sql/0002_post_punctuation.sql`. The latter is idempotent and repairs literal/entity em dashes
   in existing prose. It does not advance publication/updated dates for punctuation-only edits.
   It targets the conventional `public.blog_posts` schema; custom schemas need equivalent changes.
4. Select `publicationStatus: 'published'` in the service and matching store status. If the
   platform token cannot publish, the authorized platform operator must change that policy.
5. Remove `content.maxPostsPerWeek` from adapters. Enforce any limit in website code before calling
   the engine, using its own policy and persisted publishing history. The generic `countPostsSince`
   helper remains available to websites, but the generation pipeline never calls it.
6. Serialize overlapping website jobs in the scheduler. New inserts have a unique tenant/slug key,
   but there is no distributed run ledger or cross-process editorial reservation in the core.

## Website and content cutover

- Back up the existing posts, then import them into the intended site's rows and upload their
  assets. Keep the exact slug, original publication date, author, and canonical URL.
- Read current published rows using `createSupabaseBlogReader` or the scoped AllWeb reader.
  Render body, quick answer, FAQs, source links, and author before client JavaScript runs.
- Use `serializeBlogJsonLd` when embedding `blogPostGraph` in a script element.
- Move sitemap, RSS, related posts, and the blog hub onto the same published corpus.
- Return a retryable 503 when the store is unavailable. Missing posts alone should return 404.
- For static exports, build from a fresh database snapshot and deploy that output automatically,
  or implement dynamic blog routes. A database insert alone cannot update a static HTML export.
- Replace the website's old content-PR workflow. The shared workflow builders cannot rewrite
  YAML already copied into another repository. Re-enable generation only after a stored test post
  is visible at its canonical public URL and indexing can run against it.
- Preserve open content PRs until their posts are imported or deliberately rejected. Close them
  only after checking for slug collisions and validating the imported content.

## Operational checks

Run `npm run verify` for engine changes, then the website's own build/render checks. Run a service
`dryRun` first: it validates configuration and status without models or writes. Test an authorized
publication separately, verify the stored tenant and content, fetch its public article and feed,
and run the scorecard. A failure after persistence can leave a live article with pending indexing;
retry indexing instead of generating another post.

## Observed rollout gaps, 2026-09-03

- This repository had no configured Actions secrets or production site registry at audit time.
  A code release alone is not a deployed fleet service.
- `Iowa-Contractors/contract-iowa` had seven open `automation/blog-*` PRs (#164, #176, #186, #192,
  #198, #204, #218). Its native generator is a separate fork and its blog renders committed
  Markdown at build time. The legacy `blog-generate.yml` workflow was disabled during this audit
  to stop further content PRs. Database import and rendering/deployment cutover remain required.
- `BizrnrAI/template-website` still carries stamped blog workflows; these must be replaced so new
  website clones do not inherit the old PR path.
- AllWeb review-release workflows remain available for sites whose platform policy still requires
  reviewed release. They are separate from the engine's direct publication path.
