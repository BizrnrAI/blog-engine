import type { BlogStore, CoverImage, GeneratedBlogPost } from './types.js';
/**
 * The content store is the engine's only route to persisted posts and assets.
 *
 * Everything the pipeline does — cadence counting, topic dedup, the corpus audit, refresh,
 * discovery, the scorecard — reads through `listPosts()`, and everything it publishes goes
 * through `putPost()` / `putAsset()`. Swapping the filesystem for Postgres is therefore a
 * one-line adapter change with no branching anywhere else in the engine.
 *
 * The default store is the filesystem, so a site that says nothing behaves exactly as before.
 */
/** Markdown files under `paths.blogDir`, assets under `paths.heroDir` / `paths.assetDir`. */
export declare function createFileStore(root: string): BlogStore;
/** The configured store: `hooks.store` when a site supplies one, otherwise the filesystem. */
export declare function getStore(root: string): BlogStore;
/** Existing posts in the shape topic rotation and the cadence guard want. */
export declare function listExistingPosts(root: string): Promise<Array<{
    slug: string;
    title: string;
    date?: string;
}>>;
/**
 * Write a hero/OG asset through the store and return the URL the post should reference.
 * File stores return the same public path they always did; remote stores return a CDN URL.
 */
export declare function putAsset(root: string, key: string, data: Buffer, contentType: string): Promise<string>;
export declare function describeCover(cover: CoverImage, post: GeneratedBlogPost): string;
//# sourceMappingURL=store.d.ts.map