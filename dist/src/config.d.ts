import type { BlogEngineConfig, BlogEngineHooks, BlogEngineRuntime, BlogEngineTopics } from './types.js';
export declare function withBlogEngineRuntime<T>(runtime: BlogEngineRuntime, fn: () => T): T;
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
/** Normalized post URL prefix, no trailing slash (default '/blog'). */
export declare function blogBasePath(): string;
/**
 * Pure canonical URL formatter used by every public blog surface.
 *
 * Keeping this independent of the installed runtime lets schema/discovery
 * builders honor explicit standalone options while sharing the exact same
 * slash policy as configured sites.
 */
export declare function formatBlogPath(basePath: string, slug?: string, trailingSlash?: boolean): string;
/** Pure absolute counterpart to formatBlogPath(). */
export declare function formatBlogUrl(siteUrl: string, basePath: string, slug?: string, trailingSlash?: boolean): string;
/** Canonical relative URL for the blog hub. */
export declare function blogHubPath(): string;
/** Canonical absolute URL for the blog hub. */
export declare function blogHubUrl(): string;
/** Canonical relative URL for one post, honoring the adopting site's policy. */
export declare function blogPostPath(slug: string): string;
/** Canonical absolute URL for one post. */
export declare function blogPostUrl(slug: string): string;
/** True when this site persists posts somewhere other than the filesystem. */
export declare function hasRemoteStore(): boolean;
export declare function getBlogHooks(): BlogEngineHooks;
export declare function brandPersona(): string;
export declare const BLOG_CONFIG: BlogEngineConfig;
//# sourceMappingURL=config.d.ts.map