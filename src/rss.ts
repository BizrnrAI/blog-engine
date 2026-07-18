import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BLOG_CONFIG } from './config.js';
import { mimeTypeFor, xmlEscape } from './utils.js';

export interface RssPost {
  id: string;
  title: string;
  description: string;
  date: Date;
  image?: string;
  imageAlt?: string;
  ogImage?: string;
}

export interface BuildRssOptions {
  /**
   * Repository root containing the public/ directory. When provided, local
   * image enclosures get their real byte length from disk instead of 0
   * (some validators and readers reject length="0").
   */
  root?: string;
  /** Directory local image paths resolve against (default 'public'). */
  publicDir?: string;
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
  const lastBuildDate = posts[0]?.date ?? new Date();
  const items = posts.slice(0, BLOG_CONFIG.rss.limit)
    .map((p) => {
      const url = `${BLOG_CONFIG.identity.siteUrl}/blog/${p.id}`;
      const imageUrl = p.ogImage || p.image;
      const mime = imageUrl ? mimeTypeFor(imageUrl) : '';
      const length = imageUrl ? enclosureLength(imageUrl, options) : 0;
      const imageLines = imageUrl
        ? `\n      <enclosure url="${xmlEscape(new URL(imageUrl, BLOG_CONFIG.identity.siteUrl).href)}" type="${mime}" length="${length}"/>
      <media:content url="${xmlEscape(new URL(imageUrl, BLOG_CONFIG.identity.siteUrl).href)}" medium="image" type="${mime}">
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
    <link>${BLOG_CONFIG.identity.siteUrl}/blog</link>
    <description>${xmlEscape(BLOG_CONFIG.rss.description)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>
    <atom:link href="${BLOG_CONFIG.identity.siteUrl}${BLOG_CONFIG.rss.path}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
}
