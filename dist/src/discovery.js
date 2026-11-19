import { blogBasePath, formatBlogUrl, getBlogConfig } from './config.js';
function defaultBase() {
    try {
        return blogBasePath();
    }
    catch {
        return '/blog';
    }
}
function resolveSiteUrl(options) {
    if (options.siteUrl)
        return options.siteUrl.replace(/\/$/, '');
    return getBlogConfig().identity.siteUrl.replace(/\/$/, '');
}
function resolveTrailingSlash(options) {
    if (typeof options.trailingSlash === 'boolean')
        return options.trailingSlash;
    try {
        return Boolean(getBlogConfig().paths.trailingSlash);
    }
    catch {
        return false;
    }
}
function publicUrl(options, slug) {
    return formatBlogUrl(resolveSiteUrl(options), options.blogBasePath || defaultBase(), slug, resolveTrailingSlash(options));
}
/**
 * Drop posts that must not appear in any public surface — BLOCK verdicts from the corpus audit,
 * drafts, anything quarantined. One predicate shared by the sitemap, the feed, llms.txt and the
 * related-post graph, so those surfaces cannot contradict each other.
 */
export function excludeBlocked(posts, exclude) {
    if (!exclude || !exclude.length)
        return [...posts];
    const blocked = new Set(exclude);
    return posts.filter((p) => !blocked.has(p.slug));
}
function publicPosts(posts, options) {
    const now = (options.now ?? new Date()).getTime();
    return excludeBlocked(posts, options.exclude).filter((post) => (!post.status || post.status === 'published') && !(Date.parse(post.publishedAt) > now));
}
function lastModified(post, now) {
    const published = Date.parse(post.publishedAt);
    const modified = Date.parse(post.updatedAt ?? '');
    if (Number.isFinite(modified) && modified <= now && (!(modified < published)))
        return post.updatedAt;
    if (Number.isFinite(published) && published <= now)
        return post.publishedAt;
    return undefined;
}
/** Include lastmod for the hub when the public corpus contains a known modification date. */
export function blogHubSitemapEntry(posts, options = {}) {
    const now = (options.now ?? new Date()).getTime();
    const dates = publicPosts(posts, options).flatMap((post) => lastModified(post, now) || []);
    const newest = dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
    return { loc: publicUrl(options), ...(newest ? { lastmod: newest } : {}) };
}
/** One canonical entry per public post. Omit unknown dates and ignore invalid refresh dates. */
export function blogSitemapEntries(posts, options = {}) {
    const now = (options.now ?? new Date()).getTime();
    return publicPosts(posts, options).map((post) => {
        const lastmod = lastModified(post, now);
        return { loc: publicUrl(options, post.slug), ...(lastmod ? { lastmod } : {}) };
    });
}
/**
 * Markdown block for llms.txt: the feed line plus one "- [title](url): description"
 * line per post. Descriptions are the same meta descriptions the page emits, so
 * AI context and visible metadata cannot drift apart.
 */
export function buildBlogLlmsTxt(posts, options = {}) {
    const siteUrl = resolveSiteUrl(options);
    let feedPath = options.feedPath;
    if (!feedPath) {
        try {
            feedPath = getBlogConfig().rss.path;
        }
        catch {
            feedPath = '/blog/feed.xml';
        }
    }
    const lines = [
        `## ${options.heading || 'Blog'}`,
        '',
        `- RSS feed: ${siteUrl}${feedPath}`,
        ...publicPosts(posts, options).slice(0, options.limit ?? 50).map((post) => `- [${post.title}](${publicUrl(options, post.slug)}): ${post.description}`),
    ];
    return lines.join('\n');
}
/**
 * Related posts for templates: tag overlap (2 pts each) + same category (1 pt), recency as the
 * tiebreak. Rendering 3 related posts under every article is the cheapest internal-discovery
 * win a blog can ship (no orphans, crawl paths between old and new).
 */
export function relatedPosts(post, posts, limit = 3, exclude) {
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
//# sourceMappingURL=discovery.js.map