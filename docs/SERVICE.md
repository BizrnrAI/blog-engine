# The blog service — publishing without GitHub

The lowest-friction way to run this engine: **posts are rows, assets are objects, and one
service publishes for every site.** Nothing in the publishing path touches git, CI, tokens,
branch permissions, or a site rebuild.

## Why

Storing posts in the code repository means publishing a paragraph requires a commit, which
requires CI, which requires permissions, tokens, workflows, secrets and a full rebuild. Every
operational failure this engine has hit in production came from that coupling: a reverted Actions
permission that killed 22 consecutive runs, bot merges that don't trigger downstream workflows, a
pull request sitting open for days, four vendored engine versions drifting apart.

Content is not code. Give it its own store and the whole class of failure disappears.

## Shape

```
Supabase
├─ blog_posts        one row per post, one row-space per site_id
└─ blog-assets       heroes, OG cards, responsive variants

Blog service (one deployment: a cron route, a worker — anywhere fetch runs)
└─ @bizrnr/blog-engine
   for each due site: topic → generate → validate → images → upsert → ping → measure

Sites
└─ render /blog from the table with ISR; images from the bucket's CDN URL
```

## Setup

**1. Apply the schema** (once per Supabase project):

```bash
psql "$DATABASE_URL" -f node_modules/@bizrnr/blog-engine/sql/0001_blog_posts.sql
```

One table serves every site. Anonymous reads are limited to `status = 'published'` by RLS; the
service writes with the service-role key, which bypasses it.

**2. Point a site's runtime at the store:**

```ts
import { createSupabaseStore } from '@bizrnr/blog-engine';

configureBlogEngine({
  config, topics, brandPersona,
  hooks: {
    store: createSupabaseStore({ siteId: 'sandiegobuyguy', author: 'Kristian Peter' }),
  },
});
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are read from the environment. That is the entire
change — cadence counting, topic dedup, the corpus audit, refresh, rank rescue and the scorecard
all read through the store automatically.

**3. Run the service:**

```ts
import { runBlogService, formatServiceReport } from '@bizrnr/blog-engine';

const results = await runBlogService([
  { id: 'sandiegobuyguy', runtime: () => sdbgRuntime(), days: [1, 3, 5] },
  { id: 'kristianpeter', runtime: () => kpRuntime() },
  { id: 'sdreos',        runtime: () => sdreosRuntime(), days: [3] },
], { refresh: true });

console.log(formatServiceReport(results));
```

One site's failure never stops the others — every site returns a result, including
`status: 'failed'` with the reason.

**4. Render on the site.** Query the table with the anon key and revalidate:

```ts
const posts = await supabase
  .from('blog_posts')
  .select('*')
  .eq('site_id', 'sandiegobuyguy')
  .eq('status', 'published')
  .order('published_at', { ascending: false });
```

A new post appears on the next revalidation. No build, no deploy.

## What you gain

| | Git-as-CMS | Service + store |
|---|---|---|
| Publish a post | commit → CI → PR → merge → rebuild | one upsert |
| New site onboarding | repo, workflows, secrets, adapter | one entry in the sites array |
| Engine upgrade | bump N repos | redeploy one service |
| Rollback | revert commit + rebuild | `status = 'draft'` |
| Failure surface | permissions, tokens, cron, lockfiles | the service |

## What you give up, and the answer

- **Version history.** The row keeps the exact `markdown` the engine would have written, so an
  export back to files is lossless. Keep a nightly export if you want git history.
- **PR previews.** Use `publishStatus: 'draft'` and a preview route. Faster than a preview build.
- **The build as a gate.** It was never the real gate: the content contract, claims discipline and
  the corpus audit run *before* the upsert, and a failed validation publishes nothing.

## Both models are supported

The filesystem store remains the default and is unchanged. A static-export site keeps publishing
files; a database-backed site publishes rows; both run the same engine, the same content contract
and the same scorecard. Migrate a site when it is cheap, not on principle.
