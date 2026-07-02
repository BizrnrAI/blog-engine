export interface RssPost {
    id: string;
    title: string;
    description: string;
    date: Date;
    image?: string;
    imageAlt?: string;
    ogImage?: string;
}
export declare function buildBlogRss(posts: RssPost[]): string;
//# sourceMappingURL=rss.d.ts.map