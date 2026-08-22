import type { GscPageQuery, GscQuery } from './types.js';
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
export declare function pingGscSitemap(token: string | null): Promise<void>;
//# sourceMappingURL=gsc.d.ts.map