import type { BlogEngineRuntime } from './types.js';
export declare function cleanBlogSlugs(raw: string | undefined): string[];
export declare function waitUntilBlogUrlsLive(urls: string[], timeoutMs?: number): Promise<void>;
export declare function runBlogGenerateCli(runtime: BlogEngineRuntime, root?: string): Promise<void>;
export declare function runBlogIndexPublishedCli(runtime: BlogEngineRuntime): Promise<void>;
//# sourceMappingURL=cli.d.ts.map