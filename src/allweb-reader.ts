import { storedRowToPost } from './stored-row.js';
import type { AllWebBlogPost, AllWebBlogReader, AllWebBlogReaderOptions } from './types.js';

type CacheEntry<T> = { expiresAt: number; promise: Promise<T> };

/**
 * Canonical, least-privilege AllWeb reader for website rendering.
 *
 * The caller never sends a tenant selector. AllWeb derives site_id from the
 * bearer token, and this client independently rejects any row whose site_id
 * differs from the immutable UUID in website.manifest.json.
 */
export function createAllWebBlogReader(options: AllWebBlogReaderOptions): AllWebBlogReader {
  const apiUrl = required(options.apiUrl || process.env.ALLWEB_SITE_AGENT_URL, 'apiUrl (or ALLWEB_SITE_AGENT_URL)');
  const token = required(options.token || process.env.ALLWEB_SITE_TOKEN, 'token (or ALLWEB_SITE_TOKEN)');
  const siteId = required(options.siteId, 'siteId');
  const timeoutMs = boundedInteger(options.timeoutMs, 100, 60_000, 5_000, 'timeoutMs');
  const cacheTtlMs = boundedInteger(options.cacheTtlMs, 0, 3_600_000, 30_000, 'cacheTtlMs');
  const pageSize = boundedInteger(options.pageSize, 1, 250, 200, 'pageSize');
  const failClosed = options.failClosed !== false;
  const listCache = new Map<string, CacheEntry<AllWebBlogPost[]>>();
  const postCache = new Map<string, CacheEntry<AllWebBlogPost | null>>();

  const report = (operation: string, error: Error) => {
    if (options.onError) options.onError(operation, error);
    else console.error(`[blog-engine] ${operation}: ${error.message}`);
  };

  async function call(body: Record<string, unknown>): Promise<Record<string, any>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({})) as Record<string, any>;
      if (!response.ok || result.ok !== true) {
        const error = new Error(`AllWeb ${String(body.action)} ${response.status}: ${String(result.error || 'request_failed')}`);
        Object.assign(error, { status: response.status, code: result.error });
        throw error;
      }
      return result;
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new Error(`AllWeb ${String(body.action)} timed out after ${timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  const checkedPost = (row: Record<string, any>): AllWebBlogPost => {
    if (String(row.site_id || '') !== siteId) {
      throw new Error(`AllWeb tenant violation: received site_id ${String(row.site_id || '<missing>')}`);
    }
    return {
      ...storedRowToPost(row),
      siteId,
      status: String(row.status || ''),
      revision: Number(row.revision || 0),
    };
  };

  async function fetchPublishedList(includeContent: boolean): Promise<AllWebBlogPost[]> {
    const posts: AllWebBlogPost[] = [];
    let offset = 0;
    while (true) {
      const result = await call({
        action: 'blog_list', status: 'published', limit: pageSize, offset,
        include_content: includeContent,
      });
      const rows = Array.isArray(result.posts) ? result.posts : [];
      posts.push(...rows.map((row) => checkedPost(row)).filter((post) => post.status === 'published' && (!post.publishedAt || post.publishedAt <= new Date().toISOString().slice(0, 10))));
      const pagination = result.pagination && typeof result.pagination === 'object' ? result.pagination : null;
      const hasMore = pagination ? pagination.has_more === true : rows.length === pageSize;
      if (!hasMore || rows.length === 0) break;
      const next = Number(pagination?.next_offset ?? offset + rows.length);
      if (!Number.isInteger(next) || next <= offset) throw new Error('AllWeb blog_list returned invalid pagination');
      offset = next;
    }
    return posts;
  }

  const cached = <T>(cache: Map<string, CacheEntry<T>>, key: string, force: boolean, loader: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const current = cache.get(key);
    if (!force && current && current.expiresAt > now) return current.promise;
    const promise = loader().catch((error) => {
      cache.delete(key);
      throw error;
    });
    if (cacheTtlMs > 0) cache.set(key, { expiresAt: now + cacheTtlMs, promise });
    return promise;
  };

  return {
    async listPublishedPosts({ includeContent = true, force = false } = {}) {
      try {
        return await cached(listCache, includeContent ? 'full' : 'summary', force, () => fetchPublishedList(includeContent));
      } catch (error: any) {
        report('AllWeb published-list read failed', error instanceof Error ? error : new Error(String(error)));
        if (failClosed) return [];
        throw error;
      }
    },

    async getPublishedPost(slug: string, { force = false } = {}) {
      const cleanSlug = String(slug || '').trim();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) return null;
      try {
        return await cached(postCache, cleanSlug, force, async () => {
          try {
            const result = await call({ action: 'blog_get', slug: cleanSlug });
            const post = checkedPost(result.post || {});
            return post.status === 'published' ? post : null;
          } catch (error: any) {
            if (Number(error?.status) === 404) return null;
            throw error;
          }
        });
      } catch (error: any) {
        report(`AllWeb post read failed (${cleanSlug})`, error instanceof Error ? error : new Error(String(error)));
        if (failClosed) return null;
        throw error;
      }
    },

    invalidate() {
      listCache.clear();
      postCache.clear();
    },
  };
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`AllWeb reader: missing ${name}`);
  return value;
}

function boundedInteger(value: number | undefined, min: number, max: number, fallback: number, name: string): number {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`AllWeb reader: invalid ${name}`);
  return value;
}
