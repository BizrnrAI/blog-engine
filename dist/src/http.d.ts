/** Shared HTTP policy for dynamic blog surfaces across the website fleet. */
export declare const BLOG_CACHE_CONTROL = "public, max-age=0, s-maxage=600, stale-while-revalidate=86400";
export declare const BLOG_NO_STORE = "no-store, must-revalidate";
export declare const BLOG_RETRY_AFTER_SECONDS = 120;
export declare function blogCacheControl(stale?: boolean): string;
/** Framework-neutral retryable response for a canonical-store outage. */
export declare function blogUnavailableResponse({ body, contentType, retryAfterSeconds, }?: {
    body?: string;
    contentType?: string;
    retryAfterSeconds?: number;
}): Response;
//# sourceMappingURL=http.d.ts.map