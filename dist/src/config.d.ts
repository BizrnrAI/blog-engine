import type { BlogEngineConfig, BlogEngineHooks, BlogEngineRuntime, BlogEngineTopics } from './types.js';
/**
 * Install the adapter. The runtime is validated here so a malformed adapter fails immediately with
 * a list of what to fix, rather than deep inside the image pipeline or after a paid model call.
 * Pass `{ validate: false }` only to inspect a deliberately partial config (tests, tooling).
 */
export declare function configureBlogEngine(nextRuntime: BlogEngineRuntime, options?: {
    validate?: boolean;
}): void;
export declare function getBlogRuntime(): BlogEngineRuntime;
export declare function getBlogConfig(): BlogEngineConfig;
export declare function getBlogTopics(): BlogEngineTopics;
export declare function getBlogHooks(): BlogEngineHooks;
export declare function brandPersona(): string;
export declare const BLOG_CONFIG: BlogEngineConfig;
//# sourceMappingURL=config.d.ts.map