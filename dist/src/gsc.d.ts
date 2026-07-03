import type { GscQuery } from './types.js';
export declare function getGoogleAccessToken(): Promise<string>;
export declare function getGscQueries(): Promise<{
    token: string | null;
    queries: GscQuery[];
}>;
export declare function pingGscSitemap(token: string | null): Promise<void>;
//# sourceMappingURL=gsc.d.ts.map