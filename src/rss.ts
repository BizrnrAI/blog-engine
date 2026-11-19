import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BLOG_CONFIG, blogHubUrl, blogPostUrl } from './config.js';
import { mimeTypeFor, xmlEscape } from './utils.js';

export interface RssPost {
  id: string;
  title: string;
  description: string;
  date: Date;
  /** Last substantial public edit when available, for channel lastBuildDate. */
  updated?: Date;
  image?: string;
  imageAlt?: string;
  ogImage?: string;
}

export interface BuildRssOptions {
  /** Post ids to omit (e.g. corpus-audit BLOCK verdicts), keeping the feed in step with the sitemap. */
  exclude?: readonly string[];
  /**
   * Repository root containing the public/ directory. When provided, local
   * image enclosures get their real byte length from disk.
   */
  root?: string;
  /** Directory local image paths resolve against (default 'public'). */
  publicDir?: string;
  /** Clock for excluding future-dated items. */
  now?: Date;
}

function enclosureLength(imagePath: string, options: BuildRssOptions): number {
  if (!options.root || !imagePath.startsWith('/')) return 0;
  const file = join(options.root, options.publicDir || 'public', imagePath);
  try {
    if (existsSync(file)) return statSync(file).size;
  } catch {
    // Fall through to 0; a missing file must not break feed generation.
  }
  return 0;
}

export function buildBlogRss(posts: RssPost[], options: BuildRssOptions = {}): string {
  const now = (options.now ?? new Date()).getTime();
  const blocked = new Set(options.exclude || []);
  const visible = posts.filter((p) => !blocked.has(p.id) && p.date.getTime() <= now)
    .sort((a, b) => b.date.getTime() - a.date.getTime() || a.id.localeCompare(b.id))
    .slice(0, BLOG_CONFIG.rss.limit);
  const latest = visible.reduce((date, p) => {
    const updated = p.updated?.getTime();
    const stamp = updated !== undefined && updated >= p.date.getTime() && updated <= now ? updated : p.date.getTime();
    return Math.max(date, stamp);
  }, -Infinity);
  const lastBuildDate = Number.isFinite(latest) ? `\n  <lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>` : '';
  const items = visible
    .map((p) => {
      const url = xmlEscape(blogPostUrl(p.id));
      const imageUrl = p.ogImage || p.image;
      const mime = imageUrl ? mimeTypeFor(imageUrl) : '';
      const length = imageUrl ? enclosureLength(imageUrl, options) : 0;
      const imageHref = imageUrl ? xmlEscape(new URL(imageUrl, BLOG_CONFIG.identity.siteUrl).href) : '';
      const enclosure = length > 0 ? `\n      <enclosure url="${imageHref}" type="${mime}" length="${length}"/>` : '';
      const imageLines = imageHref
        ? `${enclosure}\n      <media:content url="${imageHref}" medium="image" type="${mime}">
        <media:description type="plain">${xmlEscape(p.imageAlt || p.title)}</media:description>
      </media:content>`
        : '';
      return `    <item>
      <title>${xmlEscape(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${xmlEscape(p.description)}</description>
      <pubDate>${p.date.toUTCString()}</pubDate>${imageLines}
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${xmlEscape(BLOG_CONFIG.rss.title)}</title>
    <link>${xmlEscape(blogHubUrl())}</link>
    <description>${xmlEscape(BLOG_CONFIG.rss.description)}</description>
    <language>${xmlEscape((BLOG_CONFIG.identity.locale || 'en-US').toLowerCase())}</language>${lastBuildDate}
  <atom:link href="${xmlEscape(new URL(BLOG_CONFIG.rss.path, BLOG_CONFIG.identity.siteUrl).href)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
}
