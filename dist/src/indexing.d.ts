/** Verify the actual URL, not a redirect to a homepage or login page. */
export declare function waitUntilBlogUrlsLive(urls: string[], timeoutMs?: number): Promise<void>;
export declare function indexingToken(): Promise<string | null>;
export declare function pingIndexNow(urls: string[]): Promise<void>;
//# sourceMappingURL=indexing.d.ts.map