import type { GeneratedBlogPost, RankRescueCandidate, RefreshRunOptions, RefreshRunResult } from './types.js';
export declare function buildRefreshMessages(args: {
    title: string;
    slug: string;
    category: string;
    existingBody: string;
    queries: Array<{
        query: string;
        impressions: number;
        position: number;
    }>;
    otherTitles: string[];
}): {
    role: string;
    content: string;
}[];
export declare function refreshBlogPost(root: string, slug: string, args?: {
    queries?: RankRescueCandidate['queries'];
    dryRun?: boolean;
}): Promise<{
    post: GeneratedBlogPost;
    markdown: string;
    file: string;
}>;
export declare function refreshBlogRun(root: string, options: RefreshRunOptions): Promise<RefreshRunResult>;
//# sourceMappingURL=refresh.d.ts.map