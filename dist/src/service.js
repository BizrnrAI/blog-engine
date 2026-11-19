import { BlogRunError } from './run-error.js';
import { withBlogEngineRuntime } from './config.js';
import { generateBlogRun } from './publisher.js';
import { refreshBlogRun } from './refresh.js';
import { submitBlogDiscovery } from './indexing.js';
import { getStore } from './store.js';
/**
 * The blog service: one process that publishes for many sites.
 *
 * This is the low-friction path. Nothing here touches git, CI, tokens, or a site rebuild — a
 * post is written to the site's store and the site renders it on the next request. Adding a
 * site means adding an entry to the sites array (or a row in your registry that produces one),
 * not a repository, a workflow, or a secret.
 *
 * Run it from anywhere a cron can run: a Vercel cron route, a worker, a GitHub schedule if you
 * still want one. Each site is isolated — one site's failure never stops the rest.
 */
export function isServiceSiteDue(site, now) {
    if (site.dailyCampaign) {
        const starts = Date.parse(site.dailyCampaign.startsAt);
        const ends = Date.parse(site.dailyCampaign.endsAt);
        if (Number.isFinite(starts) && Number.isFinite(ends) && starts < ends && now.getTime() >= starts && now.getTime() < ends)
            return true;
    }
    if (!site.days || !site.days.length)
        return true;
    return site.days.includes(now.getUTCDay());
}
/**
 * Publish for every due site. Returns one result per site — always, including failures, so a
 * caller (or the scorecard) can see exactly which sites moved and which did not.
 */
export async function runBlogService(sites, options = {}) {
    const now = options.now || new Date();
    const results = [];
    for (const site of sites) {
        if (options.only?.length && !options.only.includes(site.id))
            continue;
        if (site.enabled === false) {
            results.push({ site: site.id, status: 'skipped', detail: 'disabled', published: [], refreshed: [] });
            continue;
        }
        if (!isServiceSiteDue(site, now)) {
            results.push({ site: site.id, status: 'skipped', detail: 'not scheduled today', published: [], refreshed: [] });
            continue;
        }
        const started = Date.now();
        const published = [];
        const staged = [];
        const refreshed = [];
        try {
            const publicationStatus = site.publicationStatus || 'published';
            const runtime = await site.runtime({ publicationStatus });
            await withBlogEngineRuntime(runtime, async () => {
                // Every site runs on its own root; a store-backed site never touches the filesystem, so
                // the value only matters for filesystem stores.
                const root = site.root || process.cwd();
                const store = getStore(root);
                if (!options.allowFileStore && (!runtime.hooks?.store || store.root || runtime.hooks?.persistPost)) {
                    throw new Error('Autonomous service requires a remote BlogStore and no persistPost override; use Supabase or the authorized site gateway');
                }
                const storeStatus = store.publicationStatus;
                if ((storeStatus !== undefined || publicationStatus !== 'published') && storeStatus !== publicationStatus) {
                    throw new Error(`publication policy mismatch: service=${publicationStatus}, store=${storeStatus || 'unspecified'}`);
                }
                if (options.refresh && publicationStatus !== 'published') {
                    throw new Error('refresh requires publicationStatus=published; review/draft mode must not unpublish a live row');
                }
                if (options.dryRun) {
                    results.push({ site: site.id, status: 'nothing-to-do', detail: 'dry run: runtime and publication policy validated; no models or writes', published: [], refreshed: [] });
                    return;
                }
                let skipped;
                let operationError;
                try {
                    if (options.generate !== false) {
                        const run = await generateBlogRun(root, {
                            count: site.count ?? site.dailyTarget ?? 1,
                            dailyTarget: site.dailyTarget,
                            now,
                            dryRun: false,
                            skipPing: true,
                        });
                        (publicationStatus === 'published' ? published : staged).push(...run.written);
                        skipped = run.skipped;
                    }
                    if (options.refresh) {
                        const run = await refreshBlogRun(root, { dryRun: false, max: 1 });
                        refreshed.push(...run.refreshed);
                    }
                }
                catch (error) {
                    operationError = error;
                    if (error instanceof BlogRunError) {
                        const changed = error.operation === 'refresh' ? refreshed : publicationStatus === 'published' ? published : staged;
                        changed.push(...error.written);
                    }
                }
                const changed = [...published, ...refreshed];
                if (changed.length) {
                    try {
                        const posts = runtime.config.indexing?.requireCanonicalHtml ? await store.listPosts() : undefined;
                        await submitBlogDiscovery(changed, { posts });
                    }
                    catch (error) {
                        if (!operationError)
                            throw error;
                        const detail = (value) => value instanceof Error ? value.message : String(value);
                        throw new Error(`${detail(operationError)} | discovery: ${detail(error)}`, { cause: operationError });
                    }
                }
                if (operationError)
                    throw operationError;
                const status = staged.length
                    ? publicationStatus === 'review' ? 'queued-for-review' : 'drafted'
                    : changed.length ? 'published' : skipped ? 'skipped' : 'nothing-to-do';
                results.push({
                    site: site.id,
                    status,
                    ...(skipped ? { detail: skipped } : {}),
                    published,
                    ...(staged.length ? { staged } : {}),
                    refreshed,
                    ms: Date.now() - started,
                });
            });
        }
        catch (err) {
            // One site's failure must never stop the fleet.
            results.push({
                site: site.id,
                status: 'failed',
                detail: err instanceof Error ? err.message : String(err),
                published,
                ...(staged.length ? { staged } : {}),
                refreshed,
                ms: Date.now() - started,
            });
        }
    }
    return results;
}
export function formatServiceReport(results) {
    const icon = { published: '✓', 'queued-for-review': '◌', drafted: '◌', 'nothing-to-do': '·', skipped: '·', failed: '✗' };
    const failed = results.filter((r) => r.status === 'failed').length;
    const posts = results.reduce((n, r) => n + r.published.length + (r.staged?.length || 0) + r.refreshed.length, 0);
    return [
        `blog service: ${posts} post(s) across ${results.length} site(s)${failed ? `, ${failed} failed` : ''}`,
        '',
        ...results.map((r) => {
            const what = [
                ...r.published.map((s) => `+${s}`),
                ...(r.staged || []).map((s) => `?${s}`),
                ...r.refreshed.map((s) => `~${s}`),
            ].join(' ');
            const detail = [what, r.detail].filter(Boolean).join(' | ');
            return `${icon[r.status]} ${r.site.padEnd(28)} ${r.status.padEnd(14)} ${detail}`;
        }),
    ].join('\n');
}
//# sourceMappingURL=service.js.map