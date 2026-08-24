import { BLOG_CONFIG, blogBasePath, getBlogHooks } from './config.js';
import { auditPosts } from './audit.js';
import { getStore } from './store.js';
import { getGscPageQueries } from './gsc.js';
import { cannibalizationPairs } from './rank-rescue.js';
/**
 * Retrieval crawlers — the user agents that fetch a page to ANSWER a question right now, as
 * opposed to training crawlers. Blocking one of these is a silent, total loss of AI citation
 * for that provider, and nothing in a build ever notices.
 */
export const RETRIEVAL_CRAWLERS = ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Claude-SearchBot', 'Claude-User', 'Google-Extended'];
async function fetchText(url, timeoutMs = 12000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        const r = await fetch(url, { redirect: 'follow', signal: ctl.signal });
        return { ok: r.ok, status: r.status, text: r.ok ? await r.text() : '' };
    }
    catch {
        return { ok: false, status: 0, text: '' };
    }
    finally {
        clearTimeout(t);
    }
}
/** Is this user agent disallowed from the blog path by robots.txt? */
export function crawlerBlocked(robotsTxt, userAgent, path) {
    const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
    let active = false;
    let matched = false;
    const disallows = [];
    for (const line of lines) {
        const [rawKey, ...rest] = line.split(':');
        const key = rawKey.trim().toLowerCase();
        const value = rest.join(':').trim();
        if (key === 'user-agent') {
            if (matched && active)
                break; // finished the block that matched this UA
            active = value.toLowerCase() === userAgent.toLowerCase();
            if (active)
                matched = true;
            continue;
        }
        if (active && key === 'disallow' && value)
            disallows.push(value);
    }
    if (!matched)
        return false; // no rule naming this UA: allowed
    return disallows.some((d) => d === '/' || path.startsWith(d));
}
/**
 * Fetch the live pages a reader and a retrieval crawler actually hit, and assert the citable
 * content is in the RAW HTML. A build gate proves a page compiles; only this proves it renders,
 * returns 200, and exposes its answer before any JavaScript runs.
 */
async function liveProbeChecks(posts, siteUrl, base) {
    const checks = [];
    const sorted = [...posts].sort((a, b) => (a.publishedAt || '').localeCompare(b.publishedAt || ''));
    const newest = sorted[sorted.length - 1];
    const targets = [
        { name: 'live:hub', url: `${siteUrl}${base}` },
        { name: 'live:feed', url: `${siteUrl}${BLOG_CONFIG.rss.path}` },
        ...(sorted[0] ? [{ name: 'live:oldest-post', url: `${siteUrl}${base}/${sorted[0].slug}` }] : []),
        ...(newest && sorted.length > 1 ? [{ name: 'live:newest-post', url: `${siteUrl}${base}/${newest.slug}` }] : []),
    ];
    let newestHtml = '';
    for (const target of targets) {
        const res = await fetchText(target.url);
        if (target.name === 'live:newest-post' || (target.name === 'live:oldest-post' && sorted.length === 1))
            newestHtml = res.text;
        checks.push({
            name: target.name,
            status: res.ok ? 'pass' : 'fail',
            detail: `${target.url} → ${res.status || 'unreachable'}`,
        });
    }
    // Pre-JavaScript extractability of the passage an assistant would quote.
    if (newest && newestHtml) {
        const needle = (newest.answer || '').split(/\s+/).slice(0, 8).join(' ');
        const present = needle.length > 12 && newestHtml.includes(needle);
        checks.push({
            name: 'answer-pre-js',
            status: present ? 'pass' : 'fail',
            detail: present
                ? `quick answer present in raw HTML for /${newest.slug}`
                : `quick answer NOT in raw HTML for /${newest.slug} — answer engines cannot extract it`,
        });
    }
    else if (newest) {
        checks.push({ name: 'answer-pre-js', status: 'na', detail: 'post HTML unavailable' });
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
    // 0. cadence policy: an uncapped autonomous publisher will outrun its own evidence.
    if (!BLOG_CONFIG.content?.maxPostsPerWeek) {
        checks.push({ name: 'cadence-policy', status: 'warn', detail: 'content.maxPostsPerWeek is unset — ASEO policy caps search-led posts at 2 per rolling 7 days until reviewed evidence supports more' });
    }
    // 1. cadence — read through the store so a database-backed site is measured the same way.
    const storedPosts = await getStore(root).listPosts();
    const latest = storedPosts
        .map((p) => Date.parse(p.updatedAt || p.publishedAt))
        .filter((t) => !Number.isNaN(t))
        .sort((a, b) => b - a)[0];
    const cadence = options.expectedCadenceDays ?? 7;
    if (!latest)
        checks.push({ name: 'cadence', status: 'warn', detail: 'no dated posts found' });
    else {
        const age = (now.getTime() - latest) / 864e5;
        checks.push({
            name: 'cadence',
            status: age > cadence * 3 ? 'fail' : age > cadence * 1.5 ? 'warn' : 'pass',
            detail: `latest post ${Math.round(age)} days ago (expected every ~${cadence})`,
        });
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
        const r = await fetch(feedUrl, { redirect: 'follow' });
        const text = r.ok ? await r.text() : '';
        const items = (text.match(/<item>/g) || []).length;
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
        checks.push(...(await liveProbeChecks(parsed, BLOG_CONFIG.identity.siteUrl, blogBasePath())));
        const robots = await fetchText(`${BLOG_CONFIG.identity.siteUrl}/robots.txt`);
        if (!robots.ok)
            checks.push({ name: 'retrieval-crawlers', status: 'na', detail: `robots.txt → ${robots.status || 'unreachable'}` });
        else {
            const blockedUas = RETRIEVAL_CRAWLERS.filter((ua) => crawlerBlocked(robots.text, ua, `${blogBasePath()}/`));
            checks.push({
                name: 'retrieval-crawlers',
                status: blockedUas.length ? 'fail' : 'pass',
                detail: blockedUas.length ? `blocked by robots.txt: ${blockedUas.join(', ')}` : `all ${RETRIEVAL_CRAWLERS.length} retrieval agents allowed`,
            });
        }
    }
    // 5b. index coverage over a FIXED cohort, so "not indexed" and "not checked" stay distinct.
    const inspect = getBlogHooks().inspectUrl;
    if (inspect && parsed.length) {
        const cohort = [...parsed].sort((a, b) => a.slug.localeCompare(b.slug)).slice(0, options.indexCohortSize ?? 25);
        const states = new Map();
        let unavailable = 0;
        for (const post of cohort) {
            try {
                const result = await inspect({ url: `${BLOG_CONFIG.identity.siteUrl}${blogBasePath()}/${post.slug}` });
                if (!result) {
                    unavailable++;
                    continue;
                }
                states.set(result.coverageState, (states.get(result.coverageState) || 0) + 1);
            }
            catch {
                unavailable++;
            }
        }
        const checked = cohort.length - unavailable;
        const indexed = [...states.entries()].filter(([k]) => /indexed/i.test(k) && !/not indexed|excluded/i.test(k)).reduce((s, [, v]) => s + v, 0);
        checks.push({
            name: 'index-coverage',
            status: checked === 0 ? 'na' : indexed === 0 ? 'fail' : indexed < checked * 0.8 ? 'warn' : 'pass',
            detail: checked === 0 ? 'inspection unavailable for the whole cohort' : `${indexed}/${checked} of a fixed ${cohort.length}-post cohort indexed (${[...states].map(([k, v]) => `${k}: ${v}`).join('; ')})`,
        });
    }
    else {
        checks.push({ name: 'index-coverage', status: 'na', detail: inspect ? 'no posts' : 'no inspectUrl hook' });
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
            checks.push({
                name: 'citations',
                status: available.length ? 'pass' : 'na',
                detail: available.length ? `${mentioned}/${available.length} available probes mention ${site}` : 'no provider available',
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