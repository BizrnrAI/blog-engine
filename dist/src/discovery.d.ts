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
}
export interface SitemapEntry {
    loc: string;
    lastmod: string;
}
/** One <url> entry per post with lastmod = updatedAt (honest dates only). */
export declare function blogSitemapEntries(posts: readonly ParsedBlogPost[], options?: DiscoveryOptions): SitemapEntry[];
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
export declare function buildBlogLlmsTxt(posts: readonly ParsedBlogPost[], options?: LlmsTxtOptions): string;
//# sourceMappingURL=discovery.d.ts.map