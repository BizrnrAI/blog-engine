import { blogBasePath, formatBlogUrl, getBlogConfig } from './config.js';

function defaultBase(): string {
  try {
    return blogBasePath();
  } catch {
    return '/blog';
  }
}
import type { ParsedBlogPost } from './types.js';

/**
 * Discovery surfaces: sitemap entries and the blog section of llms.txt. Both
 * derive from the same parsed posts so sitemap, feed, and AI-context stay in
 * parity (a core ASEO coherence rule). Neither grants ranking weight on its
 * own; they make sure what you publish is findable and consistently described.
 */

export interface DiscoveryOptions {
  /** Absolute site origin. Defaults to the configured runtime. */
  siteUrl?: string;
  /** Path prefix for post URLs (default '/blog'). */
  blogBasePath?: string;
  /** Override the configured canonical trailing-slash policy. */
  trailingSlash?: boolean;
  /** Slugs to omit from every public surface (e.g. corpus-audit BLOCK verdicts). */
  exclude?: readonly string[];
  /** Clock for public date filtering. Defaults to the current time. */
  now?: Date;
}

function resolveSiteUrl(options: DiscoveryOptions): string {
  if (options.siteUrl) return options.siteUrl.replace(/\/$/, '');
  return getBlogConfig().identity.siteUrl.replace(/\/$/, '');
}

function resolveTrailingSlash(options: DiscoveryOptions): boolean {
  if (typeof options.trailingSlash === 'boolean') return options.trailingSlash;
  try {
    return Boolean(getBlogConfig().paths.trailingSlash);
  } catch {
    return false;
  }
}

function publicUrl(options: DiscoveryOptions, slug?: string): string {
  return formatBlogUrl(
    resolveSiteUrl(options),
    options.blogBasePath || defaultBase(),
    slug,
    resolveTrailingSlash(options),
  );
}

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  priority?: number;
}

/**
 * Drop posts that must not appear in any public surface — BLOCK verdicts from the corpus audit,
 * drafts, anything quarantined. One predicate shared by the sitemap, the feed, llms.txt and the
 * related-post graph, so those surfaces cannot contradict each other.
 */
export function excludeBlocked<T extends { slug: string }>(posts: readonly T[], exclude?: readonly string[]): T[] {
  if (!exclude || !exclude.length) return [...posts];
  const blocked = new Set(exclude);
  return posts.filter((p) => !blocked.has(p.slug));
}

function publicPosts(posts: readonly ParsedBlogPost[], options: DiscoveryOptions): ParsedBlogPost[] {
  const now = (options.now ?? new Date()).getTime();
  return excludeBlocked(posts, options.exclude).filter((post) =>
    (!post.status || post.status === 'published') && !(Date.parse(post.publishedAt) > now));
}

function lastModified(post: ParsedBlogPost, now: number): string | undefined {
  const published = Date.parse(post.publishedAt);
  const modified = Date.parse(post.updatedAt ?? '');
  if (Number.isFinite(modified) && modified <= now && (!(modified < published))) return post.updatedAt;
  if (Number.isFinite(published) && published <= now) return post.publishedAt;
  return undefined;
}

/** Include lastmod for the hub when the public corpus contains a known modification date. */
export function blogHubSitemapEntry(posts: readonly ParsedBlogPost[], options: DiscoveryOptions = {}): SitemapEntry {
  const now = (options.now ?? new Date()).getTime();
  const dates = publicPosts(posts, options).flatMap((post) => lastModified(post, now) || []);
  const newest = dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  return { loc: publicUrl(options), ...(newest ? { lastmod: newest } : {}) };
}

/** One canonical entry per public post. Omit unknown dates and ignore invalid refresh dates. */
export function blogSitemapEntries(posts: readonly ParsedBlogPost[], options: DiscoveryOptions = {}): SitemapEntry[] {
  const now = (options.now ?? new Date()).getTime();
  return publicPosts(posts, options).map((post) => {
    const lastmod = lastModified(post, now);
    return { loc: publicUrl(options, post.slug), ...(lastmod ? { lastmod } : {}) };
  });
}

export interface LlmsTxtOptions extends DiscoveryOptions {
  /** Section heading (default 'Blog'). */
  heading?: string;
  /** Feed path to advertise (default the configured rss.path, or '/blog/feed.xml'). */
  feedPath?: string;
  /** Maximum posts to list (default 50, newest first as given). */
  limit?: number;
}

/**
 * Markdown block for llms.txt: the feed line plus one "- [title](url): description"
 * line per post. Descriptions are the same meta descriptions the page emits, so
 * AI context and visible metadata cannot drift apart.
 */
export function buildBlogLlmsTxt(posts: readonly ParsedBlogPost[], options: LlmsTxtOptions = {}): string {
  const siteUrl = resolveSiteUrl(options);
  let feedPath = options.feedPath;
  if (!feedPath) {
    try {
      feedPath = getBlogConfig().rss.path;
    } catch {
      feedPath = '/blog/feed.xml';
    }
  }
  const lines = [
    `## ${options.heading || 'Blog'}`,
    '',
    `- RSS feed: ${siteUrl}${feedPath}`,
    ...publicPosts(posts, options).slice(0, options.limit ?? 50).map(
      (post) => `- [${post.title}](${publicUrl(options, post.slug)}): ${post.description}`,
    ),
  ];
  return lines.join('\n');
}

/**
 * Related posts for templates: tag overlap (2 pts each) + same category (1 pt), recency as the
 * tiebreak. Rendering 3 related posts under every article is the cheapest internal-discovery
 * win a blog can ship (no orphans, crawl paths between old and new).
 */
export function relatedPosts(post: ParsedBlogPost, posts: readonly ParsedBlogPost[], limit = 3, exclude?: readonly string[]): ParsedBlogPost[] {
  const tags = new Set(post.tags.map((t) => t.toLowerCase()));
  return publicPosts(posts, { exclude })
    .filter((p) => p.slug !== post.slug)
    .map((p) => {
      const overlap = p.tags.filter((t) => tags.has(t.toLowerCase())).length;
      const score = overlap * 2 + (p.category === post.category ? 1 : 0);
      return { p, score, ts: Date.parse(p.updatedAt || p.publishedAt) || 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.ts - a.ts)
    .slice(0, limit)
    .map((x) => x.p);
}
