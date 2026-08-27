import type { BlogEngineHooks } from './types.js';
export interface AllWebGscOptions {
    apiUrl: string;
    token: string;
    siteId: string;
    timeoutMs?: number;
}
/**
 * Site-scoped Search Console hooks. Google credentials remain in AllWeb's
 * server environment; the repository receives only its delegated site token.
 */
export declare function createAllWebGscHooks(options: AllWebGscOptions): Pick<BlogEngineHooks, 'fetchGscQueries' | 'fetchGscPageQueries' | 'submitSitemap'>;
//# sourceMappingURL=allweb-gsc.d.ts.map