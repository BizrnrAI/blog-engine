# Workflows — PR-safe autonomous publishing

The publishing invariant: **generated content never lands on `main` directly,
and search engines are never pinged for URLs that are not yet live.** The
engine ships two GitHub Actions builders that encode this; adapt them freely
for other CI systems — the sequence is what matters, not the YAML.

## The sequence

```
cron/dispatch
  └─ generate on a branch (--skip-ping)
       └─ in-run gates: typecheck, site build, any ASEO/content gate
            └─ open PR (peter-evans/create-pull-request)
                 └─ merge through repo rules (auto-merge is fine)
                      └─ post-merge indexing workflow (push to main, blog paths)
                           └─ poll production URL until HTTP 200 (--wait-live)
                                └─ IndexNow submit + GSC sitemap resubmit
```

Why post-merge pings: submitting URLs that 404 (branch not yet deployed)
wastes the submission and can look like spam to the endpoint. `--wait-live`
polls up to 10 minutes per URL before pinging.

## Stamping the workflows

```ts
import { blogGenerateWorkflow, blogIndexingWorkflow } from '@bizrnr/blog-engine/core';

writeFileSync('.github/workflows/blog-generate.yml', blogGenerateWorkflow({
  nodeVersion: 22,
  generateCommand: 'npm run blog:generate -- --count=1 --skip-ping',
}));
writeFileSync('.github/workflows/blog-indexing.yml', blogIndexingWorkflow({
  indexCommand: 'npm run blog:index -- --slugs=${{ steps.changed.outputs.slugs }} --wait-live',
}));
```

The generate workflow writes `slugs=<a,b>` to `GITHUB_OUTPUT`; the indexing
workflow reads changed `src/content/blog/*.md` from the merge commit (or a
manual `slugs` input).

## Production-proven gotchas

These have each caused a silent failure in a real deployment; check them
during setup:

1. **Actions cannot open PRs by default.** Set repository →
   `default_workflow_permissions=write` and
   `can_approve_pull_request_reviews=true`
   (`gh api -X PUT repos/<owner>/<repo>/actions/permissions/workflow ...`).
   For user-owned repos there is no org-level toggle. The failure mode is a
   cron that "succeeds" while the PR step errors with "GitHub Actions is not
   permitted to create or approve pull requests".
2. **Commit author matters on Vercel.** Projects with `gitForkProtection`
   block production builds whose commit author isn't a repo collaborator.
   Commit generated content as a recognized author (e.g.
   `BizRnR <info@bizrnr.com>` for BizRnR repos).
3. **Verify the merge actually happened** before reporting success or
   deploying: `gh pr merge` without an explicit PR number can silently no-op.
   Check `gh pr view --json state` and the main branch log.
4. **Cross-repo installs need auth.** If the engine package lives in a
   private repo, CI needs a token with read access to it (a PAT or GitHub App
   installation token) in the checkout/npm step. Vendoring the package or an
   adapter-only integration (no package install at site build time) are valid
   fallbacks — the engine is only a generation-time dependency.
5. **Cheap end-to-end test:** run the generator locally with real keys and
   `--skip-ping` before burning CI dispatches; discard the artifacts and let
   the first autonomous run prove its own chain.
6. **Observe one successful scheduled run** before trusting the cron. A
   manually dispatched success does not prove the schedule fires.

## Cadence and quality gates

- Default cadence: 1 post per run, 2–3 runs per week (the ASEO skill caps
  search-led autonomous posts at two per rolling seven days until reviewed
  evidence supports more). Daily is proven but start slower.
- Every run must pass the site's own gates in-run (typecheck, full site
  build, ASEO/contract gate if the site has one) *before* the PR opens, so a
  bad generation never even reaches review.
- `BLOG_ENGINE_DISABLED=1` as a repo variable is the emergency stop.
- Regulated/YMYL content requires accountable subject-matter review even when deterministic
  gates pass. With AllWeb, generate to `publicationStatus: 'review'`; release the exact revision
  separately after review. Never submit the staged URL to search engines.

## Action versions (keep current)

The builders emit `actions/checkout@v7`, `actions/setup-node@v7`, and
`peter-evans/create-pull-request@v8` (v0.3.0). Older majors run on Node 20,
which GitHub is deprecating on hosted runners — bump site workflows that still
pin `@v4`/`@v6`. Verified incident (Aug 2026): a site whose repo setting had
`default_workflow_permissions=read` failed every cron for seven weeks with
generation succeeding and only PR creation dying — the branch pushes pile up
silently. Gotcha #1 above is the fix; add a workflow-failure alert so a red cron
is noticed within a day, not a quarter.

7. **Bot merges don't trigger downstream workflows.** A PR that the generate
   workflow auto-merges with `GITHUB_TOKEN` produces a push that GitHub will
   *not* run the push-triggered indexing workflow for. The builder therefore
   emits three triggers: `push` (human merges), a daily `schedule` sweep over
   posts changed on main in the last 36h (catches bot merges), and
   `workflow_dispatch` for manual backfill by slug. Verified incident: an
   adopter's autonomous posts went unpinged for five weeks with the push trigger
   alone. Alternative: merge with a PAT so the push counts as a user event.

## Refresh workflow (v0.4.0)

`blogRefreshWorkflow()` emits a weekly (default Tuesday 14:00 UTC) PR-safe job:
rank rescue reads Search Console page×query rows, picks the best post at
position 8–30, regenerates it under the content contract with its real queries,
and opens a PR labelled `blog, automation, seo`. Manual `workflow_dispatch`
accepts explicit slugs. Refreshed posts keep their URL and publish date; only
`updated` moves — so the post-merge indexing sweep resubmits them.

## Scorecard workflow (v0.5.0)

`blogScorecardWorkflow()` runs daily with `actions: read` so it can see sibling
workflow runs; two consecutive failures of any watched workflow = FAIL, posted to
`SCORECARD_WEBHOOK_URL`. This is the alert that turns a seven-week silent outage
into a next-morning message.

## The review queue (v0.6.0)

The engine's rule is that generated content is **verified** before it publishes —
not that a human clicks merge. Those are different things, and conflating them is
expensive: on the reference property seven autonomously generated posts sat as open
pull requests for 8–16 days, six of them green the entire time. A gate nobody walks
through is a queue, not a gate.

So: keep the gates *in front of* the push (typecheck, build, ASEO/audit), and let
auto-merge-on-green carry the PR. The scorecard's `review-queue` check now **fails**
when a blog PR has been open longer than `--max-pr-age-hours` (default 48), so a
stalled queue is visible the next morning instead of at the next audit.
