import { getBlogHooks, getBlogTopics } from './config.js';
/**
 * Verified sources (opt-in). Models invent plausible URLs; every source must (1) be on an
 * allowlisted host when the site defines one and (2) actually resolve. A dead or off-list
 * source is a validation failure fed back into the retry loop — never silently dropped.
 */
export function hostAllowed(url) {
    const allow = getBlogTopics().trustedSourceDomains;
    if (!allow || !allow.length)
        return true;
    try {
        const host = new URL(url).host.toLowerCase();
        return allow.some((d) => host === d.toLowerCase() || host.endsWith('.' + d.toLowerCase()));
    }
    catch {
        return false;
    }
}
export function normalizeSources(raw) {
    if (!Array.isArray(raw))
        return [];
    return raw
        .map((s) => ({
        title: String(s?.title || '').trim(),
        url: String(s?.url || '').trim(),
        ...(s?.publisher ? { publisher: String(s.publisher).trim() } : {}),
    }))
        .filter((s) => s.title && /^https?:\/\//.test(s.url))
        .slice(0, 6);
}
async function defaultVerify(url, timeoutMs = 8000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        let r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctl.signal });
        if (r.status === 405 || r.status === 403 || r.status === 404)
            r = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctl.signal });
        return r.ok;
    }
    catch {
        return false;
    }
    finally {
        clearTimeout(t);
    }
}
/** Returns the list of problems (empty = all sources verified). */
export async function verifySources(sources) {
    const verify = getBlogHooks().verifySource || defaultVerify;
    const problems = [];
    for (const s of sources) {
        if (!hostAllowed(s.url)) {
            problems.push(`source host not in trustedSourceDomains: ${s.url}`);
            continue;
        }
        if (!(await verify(s.url)))
            problems.push(`source URL does not resolve: ${s.url}`);
    }
    return problems;
}
//# sourceMappingURL=sources.js.map