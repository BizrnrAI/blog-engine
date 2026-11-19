export interface LiveBlogPageOptions {
    /** Require a self-canonical tag and a rendered heading. */
    requireCanonicalHtml?: boolean;
    /** When known, match the H1 to the published article title. */
    title?: string;
    /** When known, require the opening of the saved answer in readable HTML. */
    answer?: string;
}
export declare function liveBlogPageProblems(url: string, response: Pick<Response, 'status' | 'headers'>, html: string, options?: LiveBlogPageOptions): string[];
/** Bound decompressed HTML retained by the publish and health probes. */
export declare function readBlogHtml(response: Response, maxBytes?: number): Promise<string>;
//# sourceMappingURL=live-page.d.ts.map