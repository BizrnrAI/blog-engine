import { getBlogHooks } from './config.js';
import { norm } from './utils.js';

/**
 * Second demand signal. The ASEO skill requires two independent demand sources before a new
 * URL is created; Search Console is the first. The default second source is public search
 * autocomplete (DuckDuckGo's suggestion endpoint — no key, no tracking), replaceable by the
 * fetchDemandSignals hook (People-Also-Ask, site search, support logs...). Network failure is
 * "no signal", never a crash.
 */
export async function duckDuckGoSuggestions(query: string, timeoutMs = 5000): Promise<string[]> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`, {
      signal: ctl.signal,
      headers: { 'User-Agent': 'bizrnr-blog-engine/1.0 (+https://github.com/BizrnrAI/blog-engine)' },
    });
    if (!r.ok) return [];
    const j = (await r.json()) as unknown;
    if (Array.isArray(j) && Array.isArray(j[1])) return (j[1] as unknown[]).map(String);
    if (Array.isArray(j)) return (j as Array<{ phrase?: string }>).map((x) => x?.phrase || '').filter(Boolean);
    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/** True when a suggestion shares most distinctive words with the query (independent corroboration). */
export function corroborates(query: string, suggestions: readonly string[]): boolean {
  const words = norm(query).split(' ').filter((w) => w.length > 2);
  if (!words.length) return false;
  const needed = Math.max(1, Math.ceil(words.length * 0.6));
  return suggestions.some((s) => {
    const ns = norm(s);
    return words.filter((w) => ns.includes(w)).length >= needed;
  });
}

export async function hasSecondDemandSignal(query: string): Promise<boolean> {
  const hook = getBlogHooks().fetchDemandSignals;
  let suggestions: string[] = [];
  try {
    suggestions = hook ? await hook(query) : await duckDuckGoSuggestions(query);
  } catch {
    suggestions = [];
  }
  return corroborates(query, suggestions);
}
