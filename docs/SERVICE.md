# The blog service — publishing without GitHub

The lowest-friction way to run this engine: **content lives in the platform's chosen store, and one
service publishes for every site.** Nothing in the publishing path needs git, CI, or a rebuild,
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
Your content platform
├─ BlogStore         list and persist structured posts
└─ asset store       heroes, OG cards, responsive variants

Blog service (one deployment: a cron route, a worker — anywhere fetch runs)
└─ @bizrnr/blog-engine/core
   for each due site: topic → generate → validate → images → upsert → ping → measure

Sites
└─ render /blog from the same platform store
```

## Setup

AllWeb-managed website repositories use `createAllWebStore`, which calls the
site-scoped gateway and never receives a Supabase service-role key:

```ts
import { createAllWebStore } from '@bizrnr/blog-engine/adapters/allweb';

hooks: {
  store: createAllWebStore({
    siteId: websiteManifest.site_id,
    apiUrl: websiteManifest.allweb.api_url,
  }),
}
```

The Supabase path below is one optional maintained adapter, not an engine dependency.

**1. Apply the schema** (once per Supabase project):

```bash
psql "$DATABASE_URL" -f node_modules/@bizrnr/blog-engine/sql/0001_blog_posts.sql
```

One table serves every site. Anonymous reads are limited to `status = 'published'` by RLS; the
service writes with the service-role key, which bypasses it.

**2. Point a site's runtime at the store:**

```ts
import { configureBlogEngine } from '@bizrnr/blog-engine/core';
import { createSupabaseStore } from '@bizrnr/blog-engine/adapters/supabase';

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
import { runBlogService, formatServiceReport } from '@bizrnr/blog-engine/core';

const results = await runBlogService([
  { id: 'sandiegobuyguy', runtime: () => sdbgRuntime(), days: [1, 3, 5] },
  { id: 'kristianpeter', runtime: () => kpRuntime() },
  { id: 'sdreos',        runtime: () => sdreosRuntime(), days: [3] },
], { refresh: true });

console.log(formatServiceReport(results));
```

One site's failure never stops the others — every site returns a result, including
`status: 'failed'` with the reason.

A temporary daily push belongs in a bounded campaign, not a permanent site fork. This example
runs daily for exactly 30 UTC dates, then automatically returns to Tuesday/Friday:

```ts
{
  id: 'legal-guides',
  days: [2, 5],
  dailyCampaign: {
    startsAt: '2026-08-28T00:00:00Z',
    endsAt: '2026-09-27T00:00:00Z', // exclusive
  },
}
```

Site-specific mechanical policy belongs in the shared retry seam so rejected prose is corrected
before image generation or persistence:

```ts
import { createProsePolicyValidator } from '@bizrnr/blog-engine/core';

hooks: {
  validatePost: createProsePolicyValidator({
    forbidMoneyAmounts: true,
    forbidObligationDurations: true,
    forbidOfficeClaims: true,
  }),
}
```

`content.blockedPhrases` is already enforced by the engine. `content.extraRules` remains prompt
guidance; put deterministic rules in `validatePost` instead of wrapping a store.

### Review-required sites

Legal, medical, financial, and other YMYL sites should stage generated rows for accountable
review. Declare the policy on the service entry and apply the same status to its AllWeb store:

```ts
{
  id: 'legal-guides',
  publicationStatus: 'review',
  runtime: ({ publicationStatus = 'review' } = {}) => ({
    config, topics, brandPersona,
    hooks: { store: createAllWebStore({
      siteId: manifest.site_id,
      apiUrl: manifest.allweb.api_url,
      publishStatus: publicationStatus,
      includeDrafts: true,
    }) },
  }),
}
```

The result is `queued-for-review`, not `published`, and the service does not submit a URL that
is not live. Publish the reviewed row through the control plane with optimistic revision
checking; then submit the live URL. Refresh mode is intentionally rejected in review/draft mode
because changing an existing published row to a staged status would unpublish it.

## Deploying it

The service is one scheduled process. Anywhere Node runs on a timer works — the point is that
**no repository is involved in publishing**.

### As a Vercel cron route

`src/app/api/cron/blog/route.ts`:

```ts
import { formatServiceReport, runBlogService } from '@bizrnr/blog-engine/core';
import { sites } from '@/blog/sites';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  // Vercel sends this header on scheduled invocations; reject anything else.
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const results = await runBlogService(sites, { refresh: true });
  console.log(formatServiceReport(results));
  return Response.json({ results }, { status: results.some((r) => r.status === 'failed') ? 500 : 200 });
}
```

`vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/blog", "schedule": "0 14 * * *" }] }
```

### As a plain script

```bash
npx tsx service/run.ts              # publish for every due site
npx tsx service/run.ts --dry-run    # show what would happen
npx tsx service/run.ts --only=acme-plumbing
```

A complete, runnable example — two sites, their briefs, and the runner — is in
`examples/service/`. Copy it and replace the briefs.

### Environment

The service needs one text-model key plus the credentials required by the adapter each site
deliberately selects. The optional Supabase adapter uses `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`; AllWeb and custom stores use their own scoped credentials. Indexing
can additionally use `INDEXNOW_KEY` and the `GOOGLE_OAUTH_*` trio. See
[.env.example](../.env.example).

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
