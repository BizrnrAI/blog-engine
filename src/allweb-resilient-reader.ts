import { createAllWebBlogReader } from './allweb-reader.js';
import type {
  AllWebBlogPost,
  ResilientAllWebBlogReader,
  ResilientAllWebBlogReaderOptions,
} from './types.js';

/**
 * Availability-aware AllWeb reader for public, database-backed blog routes.
 *
 * Public routes must distinguish "missing" from "the store cannot answer".
 * This wrapper keeps a last-known-good value per warm process and reports
 * availability explicitly, so every framework can translate an outage into a
 * retryable 503 instead of an empty 200 or false 404.
 */
export function createResilientAllWebBlogReader(
  options: ResilientAllWebBlogReaderOptions,
): ResilientAllWebBlogReader {
  const lastGoodLists = new Map<'full' | 'summary', AllWebBlogPost[]>();
  const lastGoodPosts = new Map<string, AllWebBlogPost>();
  let lastOkAt: string | null = null;
  let lastErrorAt: string | null = null;
  let lastErrorCode: string | null = null;

  const report = (operation: string, error: Error) => {
    lastErrorAt = new Date().toISOString();
    lastErrorCode = safeErrorCode(error);
    options.onError?.(operation, error);
  };

  const reader = createAllWebBlogReader({
    ...options,
    failClosed: false,
    onError: report,
  });

  const recordSuccess = () => {
    lastOkAt = new Date().toISOString();
  };

  return {
    async listPublishedPosts({ includeContent = false, force = false } = {}) {
      const key = includeContent ? 'full' : 'summary';
      try {
        const posts = await reader.listPublishedPosts({ includeContent, force });
        lastGoodLists.set(key, posts);
        recordSuccess();
        return { posts, available: true, stale: false };
      } catch {
        const cached = lastGoodLists.get(key);
        if (cached) return { posts: cached, available: true, stale: true };
        return { posts: [], available: false, stale: false };
      }
    },

    async getPublishedPost(slug, { force = false } = {}) {
      try {
        const post = await reader.getPublishedPost(slug, { force });
        if (post) lastGoodPosts.set(slug, post);
        else lastGoodPosts.delete(slug);
        recordSuccess();
        return { post, available: true, stale: false };
      } catch {
        const cached = lastGoodPosts.get(slug);
        if (cached) return { post: cached, available: true, stale: true };
        return { post: null, available: false, stale: false };
      }
    },

    health() {
      const warmCorpus = Math.max(0, ...[...lastGoodLists.values()].map((posts) => posts.length));
      return {
        lastOkAt,
        lastErrorAt,
        lastErrorCode,
        warmCorpus: lastGoodLists.size ? warmCorpus : null,
        warmPosts: lastGoodPosts.size,
      };
    },

    invalidate({ dropLastGood = true } = {}) {
      reader.invalidate();
      if (dropLastGood) {
        lastGoodLists.clear();
        lastGoodPosts.clear();
      }
    },
  };
}

function safeErrorCode(error: Error): string {
  const candidate = String((error as Error & { code?: unknown }).code || '').trim();
  if (/^[a-z0-9_-]{1,64}$/i.test(candidate)) return candidate.toLowerCase();
  const status = Number((error as Error & { status?: unknown }).status);
  if (Number.isInteger(status) && status >= 400 && status <= 599) return `http_${status}`;
  return 'store_unavailable';
}
