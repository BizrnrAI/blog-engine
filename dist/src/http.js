/** Shared HTTP policy for dynamic blog surfaces across the website fleet. */
export const BLOG_CACHE_CONTROL = 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400';
export const BLOG_NO_STORE = 'no-store, must-revalidate';
export const BLOG_RETRY_AFTER_SECONDS = 120;
export function blogCacheControl(stale = false) {
    return stale ? BLOG_NO_STORE : BLOG_CACHE_CONTROL;
}
/** Framework-neutral retryable response for a canonical-store outage. */
export function blogUnavailableResponse({ body = 'The publishing store is temporarily unavailable. Please retry shortly.', contentType = 'text/plain; charset=utf-8', retryAfterSeconds = BLOG_RETRY_AFTER_SECONDS, } = {}) {
    const retryAfter = Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds
        : BLOG_RETRY_AFTER_SECONDS;
    return new Response(body, {
        status: 503,
        headers: {
            'Cache-Control': BLOG_NO_STORE,
            'Content-Type': contentType,
            'Retry-After': String(retryAfter),
        },
    });
}
//# sourceMappingURL=http.js.map