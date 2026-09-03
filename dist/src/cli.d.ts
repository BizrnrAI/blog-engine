import type { BlogEngineRuntime, GenerateRunResult } from './types.js';
export declare function cleanBlogSlugs(raw: string | undefined): string[];
export { waitUntilBlogUrlsLive } from './indexing.js';
export declare function runBlogGenerateCli(runtime: BlogEngineRuntime, root?: string): Promise<GenerateRunResult>;
export declare function runBlogIndexPublishedCli(runtime: BlogEngineRuntime): Promise<void>;
/**
 * Refresh mode CLI: `--slugs=a,b` to force, otherwise rank rescue picks up to `--max=N` (default 1)
 * posts at position 8–30 from Search Console. Writes `slugs=` to GITHUB_OUTPUT for PR flows.
 */
export declare function runBlogRefreshCli(runtime: BlogEngineRuntime, root?: string): Promise<void>;
/**
 * Fan-out CLI: `--owner=/buy` (required) `--count=4` `--queries=a|b|c` (optional, else Search Console)
 * `--out=src/content/fanout/buy.json` (default). Writes { ownerPath, generatedAt, sourceQueries, passages }.
 */
export declare function runBlogFanoutCli(runtime: BlogEngineRuntime, root?: string): Promise<void>;
/**
 * Scorecard CLI: `--repo=owner/name --workflows=a.yml,b.yml --cadence-days=7 --queries=q1|q2 --json --strict`.
 * Posts to SCORECARD_WEBHOOK_URL when set; `--strict` exits 1 on any FAIL.
 */
export declare function runBlogScorecardCli(runtime: BlogEngineRuntime, root?: string): Promise<void>;
/** Corpus audit CLI: prints SHIP/FIX/BLOCK per post; `--json` for machine output; `--strict` exits 1 on any BLOCK. */
export declare function runBlogAuditCli(runtime: BlogEngineRuntime, root?: string): Promise<void>;
//# sourceMappingURL=cli.d.ts.map