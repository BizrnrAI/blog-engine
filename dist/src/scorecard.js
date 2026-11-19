import { BLOG_CONFIG, blogBasePath, blogHubUrl, blogPostUrl, getBlogHooks } from './config.js';
import { auditPosts } from './audit.js';
import { getStore } from './store.js';
import { getGoogleAccessToken, getGscPageQueries, hasGoogleOAuth, inspectGscUrl } from './gsc.js';
import { liveBlogPageProblems, readBlogHtml } from './live-page.js';
import { checkSitemapMembership } from './sitemap-health.js';
import { cannibalizationPairs } from './rank-rescue.js';
/** Search and user-directed retrieval agents monitored by the scorecard. */
export const RETRIEVAL_CRAWLERS = ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Claude-SearchBot', 'Claude-User', 'Googlebot', 'Bingbot'];
async function fetchText(url, redirect = 'follow') {
    try {
        const r = await fetch(url, { redirect, signal: AbortSignal.timeout(12_000) });
        if (!r.ok)
            await r.body?.cancel();
        return { ok: r.ok, status: r.status, headers: r.headers, text: r.ok ? await readBlogHtml(r) : '' };
    }
    catch {
        return { ok: false, status: 0, headers: new Headers(), text: '' };
    }
}
/** Is this user agent disallowed from the blog path by robots.txt? */
export function crawlerBlocked(robotsTxt, userAgent, path) {
    return crawlerPolicy(robotsTxt, userAgent)(path);
}
function crawlerPolicy(robotsTxt, userAgent) {
    const groups = [];
    let group;
    let sawRule = false;
    for (const line of robotsTxt.split(/\r?\n/)) {
        const clean = line.replace(/#.*$/, '').trim();
        const colon = clean.indexOf(':');
        if (colon < 0)
            continue;
        const key = clean.slice(0, colon).trim().toLowerCase();
        const value = clean.slice(colon + 1).trim();
        if (key === 'user-agent') {
            if (!group || sawRule) {
                group = { agents: [], rules: [] };
                groups.push(group);
                sawRule = false;
            }
            group.agents.push(value.toLowerCase());
        }
        else if (group && (key === 'allow' || key === 'disallow')) {
            sawRule = true;
            if (value)
                group.rules.push({ allow: key === 'allow', path: value });
        }
    }
    const ua = userAgent.toLowerCase();
    const specificity = (agents) => Math.max(-1, ...agents.map((agent) => agent === '*' ? 0 : ua.includes(agent) ? agent.length : -1));
    const best = Math.max(-1, ...groups.map((g) => specificity(g.agents)));
    if (best < 0)
        return () => false;
    const rules = groups.filter((g) => specificity(g.agents) === best).flatMap((g) => g.rules).map((rule) => {
        const anchored = rule.path.endsWith('$');
        const pattern = (anchored ? rule.path.slice(0, -1) : rule.path).split('*')
            .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
        return {
            matcher: new RegExp('^' + pattern + (anchored ? '$' : '')),
            length: rule.path.replace(/[*$]/g, '').length,
            allow: rule.allow,
        };
    }).sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow));
    return (path) => rules.find((rule) => rule.matcher.test(path))?.allow === false;
}
/**
 * Fetch the live pages a reader and a retrieval crawler actually hit, and assert the citable
 * content is in the RAW HTML. A build gate proves a page compiles; only this proves it renders,
 * returns 200, and exposes its answer before any JavaScript runs.
 */
async function liveProbeChecks(posts, siteUrl) {
    const checks = [];
    const sorted = [...posts].sort((a, b) => (a.publishedAt || '').localeCompare(b.publishedAt || '') || a.slug.localeCompare(b.slug));
    const newest = sorted[sorted.length - 1];
    const targets = [
        { name: 'live:hub', url: blogHubUrl() },
        { name: 'live:feed', url: `${siteUrl}${BLOG_CONFIG.rss.path}` },
        ...(sorted[0] ? [{ name: 'live:oldest-post', url: `${blogPostUrl(sorted[0].slug)}` }] : []),
        ...(newest && sorted.length > 1 ? [{ name: 'live:newest-post', url: `${blogPostUrl(newest.slug)}` }] : []),
    ];
    let latestPage;
    for (const target of targets) {
        const res = await fetchText(target.url, 'manual');
        if (target.name === 'live:newest-post' || (target.name === 'live:oldest-post' && sorted.length === 1))
            latestPage = res;
        checks.push({
            name: target.name,
            status: res.ok ? 'pass' : 'fail',
            detail: `${target.url} → ${res.status || 'unreachable'}`,
        });
    }
    if (newest && latestPage?.ok) {
        const url = blogPostUrl(newest.slug);
        const errors = liveBlogPageProblems(url, latestPage, latestPage.text, { requireCanonicalHtml: true, title: newest.title });
        checks.push({ name: 'canonical-article', status: errors.length ? 'fail' : 'pass', detail: errors.join(', ') || url });
        const answerMissing = !newest.answer || liveBlogPageProblems(url, latestPage, latestPage.text, { answer: newest.answer })
            .includes('published answer missing from readable HTML');
        checks.push({ name: 'answer-pre-js', status: answerMissing ? 'fail' : 'pass', detail: answerMissing
                ? `published answer missing from readable HTML for ${url}`
                : `published answer present in readable HTML for ${url}` });
    }
    else if (newest) {
        checks.push({ name: 'answer-pre-js', status: 'na', detail: 'post HTML unavailable' });
    }
    if (newest) {
        const url = blogPostUrl(newest.slug);
        const match = await checkSitemapMembership(url, [BLOG_CONFIG.gsc.sitemap, ...(BLOG_CONFIG.gsc.sitemaps ?? [])]);
        checks.push({
            name: 'sitemap-discovery',
            status: match.found ? 'pass' : match.complete ? 'fail' : 'warn',
            detail: match.found ? `newest article found: ${url}` : match.complete
                ? `newest article missing from configured sitemaps: ${url}`
                : `sitemap probe incomplete and newest article was not found: ${url}`,
        });
    }
    return checks;
}
async function checkWorkflows(repo, workflows) {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token)
        return workflows.map((w) => ({ name: `workflow:${w}`, status: 'na', detail: 'no GITHUB_TOKEN' }));
    const out = [];
    for (const w of workflows) {
        try {
            const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(w)}/runs?per_page=5&status=completed`, {
                signal: AbortSignal.timeout(12_000),
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'bizrnr-blog-engine' },
            });
            if (!r.ok) {
                out.push({ name: `workflow:${w}`, status: 'na', detail: `GitHub API ${r.status}` });
                continue;
            }
            const j = (await r.json());
            const runs = j.workflow_runs || [];
            if (!runs.length) {
                out.push({ name: `workflow:${w}`, status: 'warn', detail: 'no completed runs yet' });
                continue;
            }
            const latest = runs[0];
            const streak = runs.findIndex((x) => x.conclusion === 'success');
            const failures = streak === -1 ? runs.length : streak;
            if (latest.conclusion === 'success')
                out.push({ name: `workflow:${w}`, status: 'pass', detail: `last run ${latest.created_at.slice(0, 10)} success` });
            else if (failures >= 2)
                out.push({ name: `workflow:${w}`, status: 'fail', detail: `${failures} consecutive failures — ${latest.html_url}` });
            else
                out.push({ name: `workflow:${w}`, status: 'warn', detail: `latest run ${latest.conclusion} — ${latest.html_url}` });
        }
        catch (err) {
            out.push({ name: `workflow:${w}`, status: 'na', detail: err instanceof Error ? err.message : String(err) });
        }
    }
    return out;
}
/**
 * Blog pull requests that have been open too long. Measured failure mode: seven autonomously
 * generated posts sat as open PRs for 8-16 days, six of them green the whole time. Automated
 * publishing that waits on a human who never arrives is a queue, not a gate.
 */
async function checkOpenPrAge(repo, maxHours) {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token)
        return { name: 'review-queue', status: 'na', detail: 'no GITHUB_TOKEN' };
    try {
        const r = await fetch(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=100`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'bizrnr-blog-engine' },
        });
        if (!r.ok)
            return { name: 'review-queue', status: 'na', detail: `GitHub API ${r.status}` };
        const prs = (await r.json());
        const blogPrs = prs.filter((p) => /^(autoblog|automation\/blog|autopilot)/.test(p.head?.ref || '') || /\bblog\b|\bpost\b/i.test(p.title || ''));
        const stale = blogPrs
            .map((p) => ({ n: p.number, hours: (Date.now() - Date.parse(p.created_at)) / 36e5 }))
            .filter((p) => p.hours > maxHours)
            .sort((a, b) => b.hours - a.hours);
        if (!stale.length)
            return { name: 'review-queue', status: 'pass', detail: `${blogPrs.length} open blog PR(s), none older than ${maxHours}h` };
        return {
            name: 'review-queue',
            status: 'fail',
            detail: `${stale.length} blog PR(s) open > ${maxHours}h (oldest #${stale[0].n} at ${Math.round(stale[0].hours)}h) — publishing is queued behind a review that is not happening`,
        };
    }
    catch (err) {
        return { name: 'review-queue', status: 'na', detail: err instanceof Error ? err.message : String(err) };
    }
}
export async function runScorecard(root, options = {}) {
    const now = options.now || new Date();
    const checks = [];
    const site = BLOG_CONFIG.identity.siteHost;
    // 1. cadence — read through the store so a database-backed site is measured the same way.
    const today = now.toISOString().slice(0, 10);
    const storedPosts = (await getStore(root).listPosts()).filter((post) => (!post.status || post.status === 'published') && (!post.publishedAt || post.publishedAt.slice(0, 10) <= today));
    const latest = storedPosts
        .map((p) => Date.parse(p.publishedAt))
        .filter((t) => Number.isFinite(t) && t <= now.getTime())
        .sort((a, b) => b - a)[0];
    const cadence = options.expectedCadenceDays ?? 7;
    if (latest === undefined)
        checks.push({ name: 'cadence', status: 'warn', detail: 'no dated posts found' });
    else {
        const age = (now.getTime() - latest) / 864e5;
        checks.push({
            name: 'cadence',
            status: age > cadence * 3 ? 'fail' : age > cadence * 1.5 ? 'warn' : 'pass',
            detail: `latest new post ${Math.round(age)} days ago (expected every ~${cadence})`,
        });
    }
    if (cadence === 1) {
        const dates = new Set(storedPosts.map((post) => post.publishedAt.slice(0, 10)));
        const completedDays = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(today) - (i + 1) * 864e5).toISOString().slice(0, 10));
        const gaps = completedDays.filter((date) => !dates.has(date));
        checks.push({ name: 'daily-publication', status: gaps.length ? 'fail' : 'pass', detail: gaps.length
                ? `${7 - gaps.length}/7 completed UTC days had a new post. Missing: ${gaps.join(', ')}`
                : 'all 7 completed UTC days had a new post' });
    }
    // 2. corpus audit
    try {
        const audit = auditPosts(storedPosts, { now });
        const block = audit.filter((e) => e.verdict === 'BLOCK').length;
        const fix = audit.filter((e) => e.verdict === 'FIX').length;
        checks.push({ name: 'corpus', status: block ? 'fail' : fix ? 'warn' : 'pass', detail: `${audit.length} posts — SHIP ${audit.length - block - fix} · FIX ${fix} · BLOCK ${block}` });
    }
    catch (err) {
        checks.push({ name: 'corpus', status: 'na', detail: err instanceof Error ? err.message : String(err) });
    }
    // 3. feed
    try {
        const feedUrl = `${BLOG_CONFIG.identity.siteUrl}${BLOG_CONFIG.rss.path}`;
        const r = await fetch(feedUrl, { redirect: 'follow', signal: AbortSignal.timeout(12_000) });
        const text = r.ok ? await r.text() : '';
        const items = (text.match(/<item(?:[\s>])/g) || []).length;
        checks.push({ name: 'feed', status: r.ok && items > 0 ? 'pass' : 'fail', detail: `${feedUrl} → ${r.status}, ${items} items` });
    }
    catch (err) {
        checks.push({ name: 'feed', status: 'fail', detail: err instanceof Error ? err.message : String(err) });
    }
    // 4. workflows
    if (options.repo && options.workflows?.length)
        checks.push(...(await checkWorkflows(options.repo, options.workflows)));
    // 4b. review queue: a gate nobody walks through is a queue, not a gate.
    if (options.repo)
        checks.push(await checkOpenPrAge(options.repo, options.maxPrAgeHours ?? 48));
    // 5. live probe + retrieval access
    const parsed = storedPosts;
    if (options.liveProbe !== false) {
        checks.push(...(await liveProbeChecks(parsed, BLOG_CONFIG.identity.siteUrl)));
        const robots = await fetchText(`${BLOG_CONFIG.identity.siteUrl}/robots.txt`);
        if (!robots.ok)
            checks.push({
                name: 'retrieval-crawlers', status: [404, 410].includes(robots.status) ? 'na' : 'warn',
                detail: `robots.txt → ${robots.status || 'unreachable'}`,
            });
        else {
            const pages = [new URL(blogHubUrl()).pathname, ...parsed.map((post) => new URL(blogPostUrl(post.slug)).pathname)];
            const blockedUas = RETRIEVAL_CRAWLERS.flatMap((ua) => {
                const blocked = pages.find(crawlerPolicy(robots.text, ua));
                return blocked ? [`${ua} (${blocked})`] : [];
            });
            checks.push({
                name: 'retrieval-crawlers',
                status: blockedUas.length ? 'fail' : 'pass',
                detail: blockedUas.length ? `blocked by robots.txt: ${blockedUas.join(', ')}` : `all ${RETRIEVAL_CRAWLERS.length} retrieval agents allowed`,
            });
        }
    }
    // 5b. Index coverage records indexed, unindexed and unavailable responses.
    let token;
    const inspect = getBlogHooks().inspectUrl ?? (hasGoogleOAuth()
        ? async ({ url }) => inspectGscUrl(url, await (token ??= getGoogleAccessToken()))
        : undefined);
    const cohort = options.indexSlugs?.length
        ? [...new Set(options.indexSlugs)]
        : [...parsed].sort((a, b) => a.slug.localeCompare(b.slug)).slice(0, options.indexCohortSize ?? 25).map((post) => post.slug);
    if (inspect && cohort.length) {
        const states = new Map();
        let unavailable = 0;
        let indexed = 0;
        for (let i = 0; i < cohort.length; i += 4) {
            await Promise.all(cohort.slice(i, i + 4).map(async (slug) => {
                try {
                    const url = blogPostUrl(slug);
                    const result = await inspect({ url });
                    if (!result?.coverageState?.trim()) {
                        unavailable++;
                        return;
                    }
                    const canonicalMismatch = result.googleCanonical && result.googleCanonical !== url;
                    const state = canonicalMismatch ? 'Google-selected canonical differs' : result.coverageState;
                    states.set(state, (states.get(state) || 0) + 1);
                    const isIndexed = result.verdict
                        ? result.verdict === 'PASS'
                        : /^(?:submitted and indexed|indexed(?:,|$)|indexed though)/i.test(result.coverageState);
                    if (!canonicalMismatch && isIndexed)
                        indexed++;
                }
                catch {
                    unavailable++;
                }
            }));
        }
        const checked = cohort.length - unavailable;
        checks.push({
            name: 'index-coverage',
            status: checked === 0 ? 'na' : indexed === 0 ? 'fail' : indexed < checked * 0.8 ? 'warn' : 'pass',
            detail: checked === 0 ? 'inspection unavailable for the whole cohort' : `${indexed}/${checked} inspected URLs indexed across ${cohort.length} selected URLs (${[...states].sort().map(([k, v]) => `${k}: ${v}`).join('; ')}, ${unavailable} unavailable)`,
        });
    }
    else {
        checks.push({ name: 'index-coverage', status: 'na', detail: inspect ? 'no posts' : 'no inspectUrl hook or Google OAuth credentials' });
    }
    // 5. demand (Search Console, 28d)
    try {
        const rows = await getGscPageQueries(`${blogBasePath()}/`);
        if (!rows.length)
            checks.push({ name: 'search-console', status: 'na', detail: 'no data or not configured' });
        else {
            const impressions = rows.reduce((s, r) => s + r.impressions, 0);
            const clicks = rows.reduce((s, r) => s + r.clicks, 0);
            checks.push({ name: 'search-console', status: 'pass', detail: `28d (final data): ${impressions} impressions, ${clicks} clicks across ${new Set(rows.map((r) => r.page)).size} posts` });
            // Striking distance: page-two positions are where effort converts. Reported as its own
            // number because a site-wide average position hides it completely.
            const byPage = new Map();
            for (const r of rows) {
                const agg = byPage.get(r.page) || { impressions: 0, weighted: 0 };
                agg.impressions += r.impressions;
                agg.weighted += r.position * r.impressions;
                byPage.set(r.page, agg);
            }
            const striking = [...byPage.values()].filter((v) => v.impressions > 0 && v.weighted / v.impressions >= 11 && v.weighted / v.impressions <= 20).length;
            checks.push({ name: 'striking-distance', status: 'pass', detail: `${striking} post(s) at position 11-20 — the cohort a refresh can move` });
            const cannibals = cannibalizationPairs(rows);
            checks.push({
                name: 'cannibalization',
                status: cannibals.length ? 'warn' : 'pass',
                detail: cannibals.length
                    ? `${cannibals.length} quer${cannibals.length === 1 ? 'y' : 'ies'} split across 2+ URLs — e.g. "${cannibals[0].query}" on ${cannibals[0].pages.length} pages`
                    : 'no query earns impressions on two or more URLs',
            });
        }
    }
    catch (err) {
        checks.push({ name: 'search-console', status: 'na', detail: err instanceof Error ? err.message : String(err) });
    }
    // 6. citations
    const probe = getBlogHooks().probeCitations;
    if (probe && options.citationQueries?.length) {
        try {
            const probes = await probe({ queries: options.citationQueries, siteHost: site });
            const available = probes.filter((p) => p.available);
            const mentioned = available.filter((p) => p.mentioned).length;
            const canonicalUrls = new Set(parsed.map((post) => blogPostUrl(post.slug)));
            const cited = new Set();
            let citingProbes = 0;
            for (const result of available) {
                const matches = result.citedUrls.filter((url) => {
                    try {
                        const target = new URL(url);
                        target.hash = '';
                        target.search = '';
                        return canonicalUrls.has(target.href);
                    }
                    catch {
                        return false;
                    }
                });
                if (matches.length)
                    citingProbes++;
                matches.forEach((url) => cited.add(url.split(/[?#]/)[0]));
            }
            checks.push({
                name: 'citations',
                status: !available.length ? 'na' : citingProbes ? 'pass' : 'warn',
                detail: available.length
                    ? `${citingProbes}/${available.length} available probes cited ${cited.size} distinct blog URLs; ${mentioned} mentioned ${site}`
                    : 'no provider available',
            });
        }
        catch (err) {
            checks.push({ name: 'citations', status: 'na', detail: err instanceof Error ? err.message : String(err) });
        }
    }
    else
        checks.push({ name: 'citations', status: 'na', detail: 'no probeCitations hook' });
    const failing = checks.filter((c) => c.status === 'fail').length;
    const warning = checks.filter((c) => c.status === 'warn').length;
    const summary = `${site} blog scorecard ${now.toISOString().slice(0, 10)}: ${failing ? `${failing} FAIL` : 'no failures'}${warning ? `, ${warning} warn` : ''} — ` +
        checks.map((c) => `${c.name}=${c.status.toUpperCase()}`).join(' ');
    return { generatedAt: now.toISOString(), site, checks, summary, failing, warning };
}
export function formatScorecard(card) {
    const icon = { pass: '✓', warn: '!', fail: '✗', na: '·' };
    return [card.summary, '', ...card.checks.map((c) => `${icon[c.status]} ${c.name.padEnd(24)} ${c.detail}`)].join('\n');
}
/** POST the scorecard to a Slack-compatible webhook (SCORECARD_WEBHOOK_URL) — only when set. */
export async function postScorecard(card, webhookUrl = process.env.SCORECARD_WEBHOOK_URL) {
    if (!webhookUrl)
        return false;
    const r = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: formatScorecard(card) }) });
    return r.ok;
}
//# sourceMappingURL=scorecard.js.map