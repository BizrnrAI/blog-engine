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
export declare function buildBlogRss(posts: RssPost[], options?: BuildRssOptions): string;
//# sourceMappingURL=rss.d.ts.map