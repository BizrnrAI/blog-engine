import { getBlogConfig } from './config.js';
function resolveSiteUrl(options) {
    if (options.siteUrl)
        return options.siteUrl.replace(/\/$/, '');
    return getBlogConfig().identity.siteUrl.replace(/\/$/, '');
}
/** One <url> entry per post with lastmod = updatedAt (honest dates only). */
export function blogSitemapEntries(posts, options = {}) {
    const siteUrl = resolveSiteUrl(options);
    const base = options.blogBasePath || '/blog';
    return posts.map((post) => ({
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
    const base = options.blogBasePath || '/blog';
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
        ...posts.slice(0, options.limit ?? 50).map((post) => `- [${post.title}](${siteUrl}${base}/${post.slug}): ${post.description}`),
    ];
    return lines.join('\n');
}
//# sourceMappingURL=discovery.js.map