import { configureBlogEngine } from './config.js';
import { generateBlogRun } from './publisher.js';
import { refreshBlogRun } from './refresh.js';
import { pingIndexNow } from './indexing.js';
import { pingGscSitemap } from './gsc.js';
import { blogBasePath } from './config.js';
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
function dueToday(site, now) {
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
        if (!dueToday(site, now)) {
            results.push({ site: site.id, status: 'skipped', detail: 'not scheduled today', published: [], refreshed: [] });
            continue;
        }
        const started = Date.now();
        try {
            const runtime = await site.runtime();
            configureBlogEngine(runtime);
            // Every site runs on its own root; a store-backed site never touches the filesystem, so
            // the value only matters for filesystem stores.
            const root = site.root || process.cwd();
            const published = [];
            const refreshed = [];
            if (options.generate !== false) {
                const run = await generateBlogRun(root, { count: site.count ?? 1, dryRun: Boolean(options.dryRun), skipPing: true });
                published.push(...run.written);
                if (run.skipped) {
                    results.push({ site: site.id, status: 'skipped', detail: run.skipped, published: [], refreshed: [], ms: Date.now() - started });
                    continue;
                }
            }
            if (options.refresh) {
                const run = await refreshBlogRun(root, { dryRun: Boolean(options.dryRun), max: 1 });
                refreshed.push(...run.refreshed);
            }
            // Submit only what actually changed, and only when something did.
            const changed = [...published, ...refreshed];
            if (!options.dryRun && changed.length) {
                const base = blogBasePath();
                await pingIndexNow(changed.map((slug) => `${runtime.config.identity.siteUrl}${base}/${slug}`));
                await pingGscSitemap(null);
            }
            results.push({
                site: site.id,
                status: changed.length ? 'published' : 'nothing-to-do',
                published,
                refreshed,
                ms: Date.now() - started,
            });
        }
        catch (err) {
            // One site's failure must never stop the fleet.
            results.push({
                site: site.id,
                status: 'failed',
                detail: err instanceof Error ? err.message : String(err),
                published: [],
                refreshed: [],
                ms: Date.now() - started,
            });
        }
    }
    return results;
}
export function formatServiceReport(results) {
    const icon = { published: '✓', 'nothing-to-do': '·', skipped: '·', failed: '✗' };
    const failed = results.filter((r) => r.status === 'failed').length;
    const posts = results.reduce((n, r) => n + r.published.length + r.refreshed.length, 0);
    return [
        `blog service: ${posts} post(s) across ${results.length} site(s)${failed ? `, ${failed} failed` : ''}`,
        '',
        ...results.map((r) => {
            const what = [...r.published.map((s) => `+${s}`), ...r.refreshed.map((s) => `~${s}`)].join(' ') || r.detail || '';
            return `${icon[r.status]} ${r.site.padEnd(28)} ${r.status.padEnd(14)} ${what}`;
        }),
    ].join('\n');
}
//# sourceMappingURL=service.js.map