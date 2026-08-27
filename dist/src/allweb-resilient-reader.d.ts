import type { ResilientAllWebBlogReader, ResilientAllWebBlogReaderOptions } from './types.js';
/**
 * Availability-aware AllWeb reader for public, database-backed blog routes.
 *
 * Public routes must distinguish "missing" from "the store cannot answer".
 * This wrapper keeps a last-known-good value per warm process and reports
 * availability explicitly, so every framework can translate an outage into a
 * retryable 503 instead of an empty 200 or false 404.
 */
export declare function createResilientAllWebBlogReader(options: ResilientAllWebBlogReaderOptions): ResilientAllWebBlogReader;
//# sourceMappingURL=allweb-resilient-reader.d.ts.map