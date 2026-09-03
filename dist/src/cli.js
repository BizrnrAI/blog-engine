import { BlogRunError } from './run-error.js';
import { writeFileSync } from 'node:fs';
import { blogPostUrl, configureBlogEngine, getBlogHooks } from './config.js';
import { generateBlogRun } from './publisher.js';
import { refreshBlogRun } from './refresh.js';
import { getStore } from './store.js';
import { auditPosts, formatAuditReport } from './audit.js';
import { generateFanoutPassages } from './fanout.js';
import { formatScorecard, postScorecard, runScorecard } from './scorecard.js';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getGoogleAccessToken, pingGscSitemap } from './gsc.js';
import { pingIndexNow } from './indexing.js';
function parseArg(name, argv = process.argv) {
    const prefix = `--${name}=`;
    return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}
export function cleanBlogSlugs(raw) {
    return Array.from(new Set((raw || '')
        .split(/[,\s]+/)
        .map((slug) => slug.trim().replace(/^\/?[a-z0-9-]+\//, '').replace(/\/$/, ''))
        .filter(Boolean)
        .filter((slug) => /^[a-z0-9-]+$/.test(slug))));
}
export { waitUntilBlogUrlsLive } from './indexing.js';
import { waitUntilBlogUrlsLive } from './indexing.js';
function requireRemoteStore(runtime) {
    if (process.env.BLOG_REQUIRE_REMOTE_STORE !== '1')
        return;
    if (!runtime.hooks?.store || runtime.hooks.store.root || runtime.hooks.persistPost) {
        throw new Error('Direct publishing requires a remote BlogStore, with no filesystem or persistPost fallback');
    }
    if (runtime.hooks.store.publicationStatus !== 'published')
        throw new Error('Direct publishing requires store publicationStatus=published');
}
export async function runBlogGenerateCli(runtime, root = process.cwd()) {
    const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';
    const count = Math.max(1, Number(parseArg('count') || '1') || 1);
    const skipPing = process.argv.includes('--skip-ping') || process.env.SKIP_PING === '1';
    configureBlogEngine(runtime);
    requireRemoteStore(runtime);
    let result;
    try {
        result = await generateBlogRun(root, { count, dryRun, skipPing });
    }
    catch (error) {
        if (error instanceof BlogRunError && process.env.GITHUB_OUTPUT && error.written.length)
            writeFileSync(process.env.GITHUB_OUTPUT, `slugs=${error.written.join(',')}\n`, { flag: 'a' });
        throw error;
    }
    if (process.env.GITHUB_OUTPUT && result.written.length) {
        writeFileSync(process.env.GITHUB_OUTPUT, `slugs=${result.written.join(',')}\n`, { flag: 'a' });
    }
    if (!dryRun && result.written.length === 0 && !result.skipped) {
        process.exitCode = 1;
    }
    return result;
}
export async function runBlogIndexPublishedCli(runtime) {
    configureBlogEngine(runtime);
    requireRemoteStore(runtime);
    const slugs = cleanBlogSlugs(parseArg('slugs') || process.env.BLOG_SLUGS);
    const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';
    if (process.env.BLOG_ENGINE_DISABLED === '1') {
        console.log('[blog-indexing] BLOG_ENGINE_DISABLED=1 - exiting.');
        return;
    }
    if (!slugs.length) {
        console.log('[blog-indexing] No changed blog slugs found.');
        return;
    }
    const urls = slugs.map(blogPostUrl);
    if (dryRun) {
        console.log(`[blog-indexing] Dry run: would submit ${urls.length} live URL(s): ${urls.join(', ')}`);
        return;
    }
    await waitUntilBlogUrlsLive(urls);
    await pingIndexNow(urls);
    // A submitSitemap hook owns its own auth, so it needs no OAuth token (pingGscSitemap routes to it).
    if (getBlogHooks().submitSitemap) {
        await pingGscSitemap(null);
    }
    else if (process.env.GOOGLE_OAUTH_CLIENT_ID &&
        process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
        process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
        try {
            await pingGscSitemap(await getGoogleAccessToken());
        }
        catch (err) {
            console.warn('[blog-indexing] GSC sitemap resubmit skipped:', err instanceof Error ? err.message : String(err));
        }
    }
    console.log(`[blog-indexing] Submitted ${urls.length} live URL(s): ${urls.join(', ')}`);
    // Distribution seam: syndication runs only after URLs are live + submitted, and never blocks.
    const afterIndexed = getBlogHooks().afterIndexed;
    if (afterIndexed) {
        try {
            await afterIndexed({ urls, slugs });
        }
        catch (err) {
            console.warn('[blog-indexing] afterIndexed hook failed (publish unaffected):', err instanceof Error ? err.message : String(err));
        }
    }
}
/**
 * Refresh mode CLI: `--slugs=a,b` to force, otherwise rank rescue picks up to `--max=N` (default 1)
 * posts at position 8–30 from Search Console. Writes `slugs=` to GITHUB_OUTPUT for PR flows.
 */
export async function runBlogRefreshCli(runtime, root = process.cwd()) {
    configureBlogEngine(runtime);
    requireRemoteStore(runtime);
    const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';
    const slugs = cleanBlogSlugs(parseArg('slugs') || process.env.BLOG_SLUGS);
    const max = Math.max(1, Number(parseArg('max') || '1') || 1);
    let result;
    try {
        result = await refreshBlogRun(root, { slugs, max, dryRun });
    }
    catch (error) {
        if (error instanceof BlogRunError && process.env.GITHUB_OUTPUT && error.written.length)
            writeFileSync(process.env.GITHUB_OUTPUT, `slugs=${error.written.join(',')}\n`, { flag: 'a' });
        throw error;
    }
    if (result.candidates.length) {
        console.log('[blog-refresh] rank-rescue candidates (top 10):');
        for (const c of result.candidates.slice(0, 10)) {
            console.log(`  ${c.action.padEnd(16)} ${c.slug.padEnd(50)} pos ${String(c.position).padStart(5)}  impr ${String(c.impressions).padStart(6)}  ctr ${(c.ctr * 100).toFixed(1)}%  score ${c.score}`);
        }
    }
    if (process.env.GITHUB_OUTPUT && result.refreshed.length) {
        writeFileSync(process.env.GITHUB_OUTPUT, `slugs=${result.refreshed.join(',')}\n`, { flag: 'a' });
    }
}
/**
 * Fan-out CLI: `--owner=/buy` (required) `--count=4` `--queries=a|b|c` (optional, else Search Console)
 * `--out=src/content/fanout/buy.json` (default). Writes { ownerPath, generatedAt, sourceQueries, passages }.
 */
export async function runBlogFanoutCli(runtime, root = process.cwd()) {
    configureBlogEngine(runtime);
    requireRemoteStore(runtime);
    const owner = parseArg('owner');
    if (!owner)
        throw new Error('--owner=/path is required');
    const count = Math.max(2, Number(parseArg('count') || '4') || 4);
    const queries = (parseArg('queries') || '').split('|').map((q) => q.trim()).filter(Boolean);
    const out = parseArg('out') || join('src/content/fanout', `${owner.replace(/^\/+|\/+$/g, '').replace(/\//g, '-') || 'home'}.json`);
    const result = await generateFanoutPassages(owner, { count, queries });
    const file = join(root, out);
    if (process.argv.includes('--dry-run'))
        console.log(JSON.stringify(result, null, 2));
    else {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
        console.log(`[blog-fanout] wrote ${file} (${result.passages.length} passages for ${owner})`);
    }
}
/**
 * Scorecard CLI: `--repo=owner/name --workflows=a.yml,b.yml --cadence-days=7 --queries=q1|q2 --json --strict`.
 * Posts to SCORECARD_WEBHOOK_URL when set; `--strict` exits 1 on any FAIL.
 */
export async function runBlogScorecardCli(runtime, root = process.cwd()) {
    configureBlogEngine(runtime);
    requireRemoteStore(runtime);
    const card = await runScorecard(root, {
        repo: parseArg('repo') || process.env.GITHUB_REPOSITORY,
        workflows: (parseArg('workflows') || '').split(',').map((s) => s.trim()).filter(Boolean),
        expectedCadenceDays: Number(parseArg('cadence-days') || '7') || 7,
        citationQueries: (parseArg('queries') || '').split('|').map((s) => s.trim()).filter(Boolean),
    });
    console.log(process.argv.includes('--json') ? JSON.stringify(card, null, 2) : formatScorecard(card));
    const posted = await postScorecard(card);
    if (posted)
        console.log('[blog-scorecard] posted to webhook');
    if (process.argv.includes('--strict') && card.failing > 0)
        process.exitCode = 1;
}
/** Corpus audit CLI: prints SHIP/FIX/BLOCK per post; `--json` for machine output; `--strict` exits 1 on any BLOCK. */
export async function runBlogAuditCli(runtime, root = process.cwd()) {
    configureBlogEngine(runtime);
    requireRemoteStore(runtime);
    const entries = auditPosts(await getStore(root).listPosts(), { staleAfterDays: Number(parseArg('stale-days') || '365') || 365 });
    if (process.argv.includes('--json'))
        console.log(JSON.stringify(entries, null, 2));
    else
        console.log(formatAuditReport(entries));
    if (process.argv.includes('--strict') && entries.some((e) => e.verdict === 'BLOCK'))
        process.exitCode = 1;
}
//# sourceMappingURL=cli.js.map