import { assertNoEmDashes } from './punctuation.js';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BLOG_CONFIG, getBlogHooks } from './config.js';
import { contentExtensions, readGeneratedBlogPosts } from './content-reader.js';
import type { BlogStore, CoverImage, GeneratedBlogPost, ParsedBlogPost, PutPostArgs } from './types.js';

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
export function createFileStore(root: string): BlogStore {
  return {
    name: 'file',
    root,
    async listPosts(): Promise<ParsedBlogPost[]> {
      return readGeneratedBlogPosts({
        root,
        blogDir: BLOG_CONFIG.paths.blogDir,
        fallback: {
          description: '',
          author: BLOG_CONFIG.identity.author?.name || '',
          heroImage: '',
          heroImageAltPrefix: BLOG_CONFIG.identity.name,
        },
      });
    },
    async putPost({ post, cover, markdown }: PutPostArgs): Promise<string> {
      assertNoEmDashes({ post, cover, markdown });
      const file = join(root, BLOG_CONFIG.paths.blogDir, `${post.slug}${contentExtensions()[0]}`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, markdown, 'utf8');
      return file;
    },
    async putAsset(key: string, data: Buffer): Promise<string> {
      // `key` is the public path the site will serve, e.g. /assets/blog/x.webp — map it back
      // under public/ so the existing render paths keep working untouched.
      const file = join(root, 'public', key.replace(/^\//, ''));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, data);
      return key;
    },
  };
}

/** The configured store: `hooks.store` when a site supplies one, otherwise the filesystem. */
export function getStore(root: string): BlogStore {
  const hook = (() => {
    try {
      return getBlogHooks().store;
    } catch {
      return undefined;
    }
  })();
  return hook || createFileStore(root);
}

/** Existing posts in the shape topic rotation and the cadence guard want. */
export async function listExistingPosts(root: string): Promise<Array<{ slug: string; title: string; date?: string }>> {
  const posts = await getStore(root).listPosts();
  return posts.map((p) => ({
    slug: p.slug,
    title: p.title,
    ...(p.publishedAt ? { date: p.publishedAt.slice(0, 10) } : {}),
  }));
}

/**
 * Write a hero/OG asset through the store and return the URL the post should reference.
 * File stores return the same public path they always did; remote stores return a CDN URL.
 */
export async function putAsset(root: string, key: string, data: Buffer, contentType: string): Promise<string> {
  const store = getStore(root);
  if (!store.putAsset) throw new Error(`store "${store.name}" cannot store assets`);
  return store.putAsset(key, data, contentType);
}

export function describeCover(cover: CoverImage, post: GeneratedBlogPost): string {
  return `${post.slug} (${cover.source}${cover.width ? `, ${cover.width}x${cover.height}` : ''})`;
}
