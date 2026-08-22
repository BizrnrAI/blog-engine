import type { BlogEngineRuntime } from './types.js';
export declare function cleanBlogSlugs(raw: string | undefined): string[];
export declare function waitUntilBlogUrlsLive(urls: string[], timeoutMs?: number): Promise<void>;
export declare function runBlogGenerateCli(runtime: BlogEngineRuntime, root?: string): Promise<void>;
export declare function runBlogIndexPublishedCli(runtime: BlogEngineRuntime): Promise<void>;
/**
 * Refresh mode CLI: `--slugs=a,b` to force, otherwise rank rescue picks up to `--max=N` (default 1)
 * posts at position 8–30 from Search Console. Writes `slugs=` to GITHUB_OUTPUT for PR flows.
 */
export declare function runBlogRefreshCli(runtime: BlogEngineRuntime, root?: string): Promise<void>;
/** Corpus audit CLI: prints SHIP/FIX/BLOCK per post; `--json` for machine output; `--strict` exits 1 on any BLOCK. */
export declare function runBlogAuditCli(runtime: BlogEngineRuntime, root?: string): Promise<void>;
//# sourceMappingURL=cli.d.ts.map