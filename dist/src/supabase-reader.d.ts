import type { ParsedBlogPost } from './types.js';
export interface SupabaseBlogReaderOptions {
    url: string;
    /** Public anon/publishable key only. Never use the publisher's service-role key. */
    anonKey: string;
    siteId: string;
    table?: string;
    schema?: string;
    timeoutMs?: number;
    pageSize?: number;
}
/** Server rendering reads current published rows; failures throw so routes can return 503. */
export declare function createSupabaseBlogReader(options: SupabaseBlogReaderOptions): {
    listPublishedPosts(): Promise<ParsedBlogPost[]>;
    getPublishedPost(slug: string): Promise<ParsedBlogPost | null>;
};
//# sourceMappingURL=supabase-reader.d.ts.map