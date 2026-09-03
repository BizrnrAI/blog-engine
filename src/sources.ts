import { getBlogHooks, getBlogTopics } from './config.js';
import type { BlogSource } from './types.js';

/**
 * Verified sources (opt-in). Models invent plausible URLs; every source must (1) be on an
 * allowlisted host when the site defines one and (2) actually resolve. A dead or off-list
 * source is a validation failure fed back into the retry loop — never silently dropped.
 */
export function hostAllowed(url: string): boolean {
  const allow = getBlogTopics().trustedSourceDomains;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || /^[\d.]+$/.test(host) || host.includes(':')) return false;
    if (!allow || !allow.length) return true;
    return allow.some((d) => host === d.toLowerCase() || host.endsWith('.' + d.toLowerCase()));
  } catch {
    return false;
  }
}

export function normalizeSources(raw: unknown): BlogSource[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => ({
      title: String((s as any)?.title || '').trim(),
      url: String((s as any)?.url || '').trim(),
      ...((s as any)?.publisher ? { publisher: String((s as any).publisher).trim() } : {}),
    }))
    .filter((s) => s.title && /^https?:\/\//.test(s.url))
    .slice(0, 6);
}

async function defaultVerify(url: string, timeoutMs = 8000): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let target = url;
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (!hostAllowed(target)) return false;
      let r = await fetch(target, { method: 'HEAD', redirect: 'manual', signal: ctl.signal });
      if ([405, 403, 404].includes(r.status)) {
        await r.body?.cancel();
        r = await fetch(target, { method: 'GET', redirect: 'manual', signal: ctl.signal });
      }
      await r.body?.cancel();
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        const location = r.headers.get('location');
        if (!location) return false;
        target = new URL(location, target).href;
        continue;
      }
      return r.ok;
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Returns the list of problems (empty = all sources verified). */
export async function verifySources(sources: readonly BlogSource[]): Promise<string[]> {
  const verify = getBlogHooks().verifySource || defaultVerify;
  const problems: string[] = [];
  for (const s of sources) {
    if (!hostAllowed(s.url)) {
      problems.push(`source host not in trustedSourceDomains: ${s.url}`);
      continue;
    }
    if (!(await verify(s.url))) problems.push(`source URL does not resolve: ${s.url}`);
  }
  return problems;
}
