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
    /** Slugs to omit from every public surface (e.g. corpus-audit BLOCK verdicts). */
    exclude?: readonly string[];
}
export interface SitemapEntry {
    loc: string;
    lastmod: string;
    priority?: number;
}
/**
 * Drop posts that must not appear in any public surface — BLOCK verdicts from the corpus audit,
 * drafts, anything quarantined. One predicate shared by the sitemap, the feed, llms.txt and the
 * related-post graph, so those surfaces cannot contradict each other.
 */
export declare function excludeBlocked<T extends {
    slug: string;
}>(posts: readonly T[], exclude?: readonly string[]): T[];
/**
 * The hub's own sitemap entry, with lastmod = the newest post's date.
 *
 * Without it a crawler has no signal that the index page changed, so newly linked posts can sit
 * undiscovered for days even though the sitemap lists them — the single most expensive discovery
 * defect in the playbook's field notes.
 */
export declare function blogHubSitemapEntry(posts: readonly ParsedBlogPost[], options?: DiscoveryOptions): SitemapEntry;
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
/**
 * Related posts for templates: tag overlap (2 pts each) + same category (1 pt), recency as the
 * tiebreak. Rendering 3 related posts under every article is the cheapest internal-discovery
 * win a blog can ship (no orphans, crawl paths between old and new).
 */
export declare function relatedPosts(post: ParsedBlogPost, posts: readonly ParsedBlogPost[], limit?: number, exclude?: readonly string[]): ParsedBlogPost[];
//# sourceMappingURL=discovery.d.ts.map