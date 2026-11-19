import { SaxesParser } from 'saxes';
import { readBlogHtml } from './live-page.js';

function readSitemap(xml: string): { urls: string[]; children: string[] } {
  const names: string[] = [];
  const urls: string[] = [];
  const children: string[] = [];
  let location = '';
  let root = '';
  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => { throw new Error('Unexpected sitemap DOCTYPE'); });
  parser.on('opentag', (tag) => {
    names.push(tag.local);
    if (names.length === 1) root = tag.local;
    if (names.length === 3 && tag.local === 'loc') location = '';
  });
  const text = (value: string) => {
    if (names.length === 3 && names[2] === 'loc') location += value;
  };
  parser.on('text', text);
  parser.on('cdata', text);
  parser.on('closetag', () => {
    if (names.length === 3 && names[2] === 'loc' && location.trim()) {
      if (names[0] === 'urlset' && names[1] === 'url') urls.push(location.trim());
      if (names[0] === 'sitemapindex' && names[1] === 'sitemap') children.push(location.trim());
    }
    names.pop();
  });
  parser.write(xml).close();
  if (root !== 'urlset' && root !== 'sitemapindex') throw new Error('Unexpected sitemap root');
  return { urls, children };
}

export async function checkSitemapMembership(url: string, sitemaps: readonly string[]): Promise<{ found: boolean; complete: boolean }> {
  const limit = 12;
  const queue = [...new Set(sitemaps)];
  const seen = new Set<string>();
  let complete = true;
  while (queue.length && seen.size < limit) {
    const group = queue.splice(0, Math.min(4, limit - seen.size));
    group.forEach((sitemap) => seen.add(sitemap));
    const results = await Promise.all(group.map(async (sitemap) => {
      try {
        const response = await fetch(sitemap, { redirect: 'manual', signal: AbortSignal.timeout(8_000) });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`HTTP ${response.status}`);
        }
        return { sitemap, ...readSitemap(await readBlogHtml(response, 10 * 1024 * 1024)) };
      } catch {
        complete = false;
        return null;
      }
    }));
    if (results.some((result) => result?.urls.includes(url))) return { found: true, complete: true };
    for (const result of results) {
      if (!result) continue;
      const origin = new URL(result.sitemap).origin;
      for (const location of result.children) {
        try {
          const child = new URL(location);
          if (child.origin !== origin || child.username || child.password) { complete = false; continue; }
          if (!seen.has(child.href) && !queue.includes(child.href)) {
            if (queue.length + seen.size < limit) queue.push(child.href);
            else complete = false;
          }
        } catch { complete = false; }
      }
    }
  }
  return { found: false, complete: complete && queue.length === 0 };
}
