import type { GscPageQuery, GscQuery, UrlInspection } from './types.js';
export declare function hasGoogleOAuth(): boolean;
export declare function inspectGscUrl(url: string, token: string): Promise<UrlInspection | null>;
export declare function parseIndexStatus(value: unknown): UrlInspection | null;
export declare function getGoogleAccessToken(): Promise<string>;
export declare function getGscQueries(): Promise<{
    token: string | null;
    queries: GscQuery[];
}>;
/**
 * Page × query rows for posts under pathPrefix (default '/blog/'), 28-day window. Used by rank
 * rescue and refresh mode. Returns [] (never throws) when Search Console is not configured.
 */
export declare function getGscPageQueries(pathPrefix?: string): Promise<GscPageQuery[]>;
/** Submit every configured sitemap and surface individual failures to the caller. */
export declare function submitGscSitemaps(token: string | null): Promise<string[]>;
/** Compatibility wrapper for callers expecting a best-effort ping. */
export declare function pingGscSitemap(token: string | null): Promise<void>;
//# sourceMappingURL=gsc.d.ts.map