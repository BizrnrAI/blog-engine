import type { AllWebBlogReader, AllWebBlogReaderOptions } from './types.js';
/**
 * Canonical, least-privilege AllWeb reader for website rendering.
 *
 * The caller never sends a tenant selector. AllWeb derives site_id from the
 * bearer token, and this client independently rejects any row whose site_id
 * differs from the immutable UUID in website.manifest.json.
 */
export declare function createAllWebBlogReader(options: AllWebBlogReaderOptions): AllWebBlogReader;
//# sourceMappingURL=allweb-reader.d.ts.map