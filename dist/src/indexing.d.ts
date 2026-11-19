import type { ParsedBlogPost } from './types.js';
/** Verify canonical URLs without following a redirect to a homepage or login page. */
export declare function waitUntilBlogUrlsLive(urls: string[], timeoutMs?: number): Promise<void>;
export declare function indexingToken(): Promise<string | null>;
export declare function pingIndexNow(urls: string[]): Promise<void>;
export interface DiscoverySubmissionOptions {
    /** Published content used to test for a current H1 and quick answer in strict mode. */
    posts?: readonly Pick<ParsedBlogPost, 'slug' | 'title' | 'answer'>[];
    timeoutMs?: number;
    /** Reuse the Search Console query token when available. */
    googleToken?: string | null;
    /** Run the distribution hook after discovery succeeds. Default true. */
    notify?: boolean;
}
export interface DiscoverySubmissionResult {
    liveUrls: string[];
    indexNow: 'accepted' | 'key-validation-pending' | 'skipped';
    submittedSitemaps: string[];
}
/** Verify once, submit independent provider signals, and report failures without losing ready URLs. */
export declare function submitBlogDiscovery(slugs: readonly string[], options?: DiscoverySubmissionOptions): Promise<DiscoverySubmissionResult>;
//# sourceMappingURL=indexing.d.ts.map