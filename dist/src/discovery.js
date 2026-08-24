import { blogBasePath, getBlogConfig } from './config.js';
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
/**
 * The hub's own sitemap entry, with lastmod = the newest post's date.
 *
 * Without it a crawler has no signal that the index page changed, so newly linked posts can sit
 * undiscovered for days even though the sitemap lists them — the single most expensive discovery
 * defect in the playbook's field notes.
 */
export function blogHubSitemapEntry(posts, options = {}) {
    const siteUrl = resolveSiteUrl(options);
    const base = options.blogBasePath || defaultBase();
    const newest = posts
        .map((p) => p.updatedAt || p.publishedAt)
        .filter(Boolean)
        .sort()
        .pop();
    return { loc: `${siteUrl}${base}`, lastmod: newest || new Date().toISOString().slice(0, 10) };
}
/** One <url> entry per post with lastmod = updatedAt (honest dates only). */
export function blogSitemapEntries(posts, options = {}) {
    const siteUrl = resolveSiteUrl(options);
    const base = options.blogBasePath || defaultBase();
    return excludeBlocked(posts, options.exclude).map((post) => ({
        loc: `${siteUrl}${base}/${post.slug}`,
        lastmod: post.updatedAt || post.publishedAt,
    }));
}
/**
 * Markdown block for llms.txt: the feed line plus one "- [title](url): description"
 * line per post. Descriptions are the same meta descriptions the page emits, so
 * AI context and visible metadata cannot drift apart.
 */
export function buildBlogLlmsTxt(posts, options = {}) {
    const siteUrl = resolveSiteUrl(options);
    const base = options.blogBasePath || defaultBase();
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
        ...excludeBlocked(posts, options.exclude).slice(0, options.limit ?? 50).map((post) => `- [${post.title}](${siteUrl}${base}/${post.slug}): ${post.description}`),
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
    return excludeBlocked(posts, exclude)
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