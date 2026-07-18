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
export declare function buildBlogRss(posts: RssPost[], options?: BuildRssOptions): string;
//# sourceMappingURL=rss.d.ts.map