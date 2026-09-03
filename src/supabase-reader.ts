import { storedRowToPost } from './stored-row.js';
import type { ParsedBlogPost } from './types.js';

export interface SupabaseBlogReaderOptions {
  url: string;
  /** Public anon/publishable key only. Never use the publisher's service-role key. */
  anonKey: string;
  siteId: string;
  table?: string;
  schema?: string;
  timeoutMs?: number;
  pageSize?: number;
}

/** Server rendering reads current published rows; failures throw so routes can return 503. */
export function createSupabaseBlogReader(options: SupabaseBlogReaderOptions) {
  const url = new URL(options.url);
  if (!/^https?:$/.test(url.protocol) || !options.anonKey || !options.siteId) throw new Error('Supabase reader requires url, anonKey, and siteId');
  const table = options.table || 'blog_posts';
  const schema = options.schema || 'public';
  if (![table, schema].every((value) => /^[a-z_][a-z0-9_]*$/i.test(value))) throw new Error('Invalid Supabase table/schema');
  const pageSize = options.pageSize ?? 200;
  const timeoutMs = options.timeoutMs ?? 8_000;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error('Invalid pageSize');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) throw new Error('Invalid timeoutMs');
  async function read(extra: Record<string, string>): Promise<ParsedBlogPost[]> {
    const today = new Date().toISOString().slice(0, 10);
    const query = new URLSearchParams({ site_id: `eq.${options.siteId}`, status: 'eq.published', published_at: `lte.${today}`, order: 'published_at.desc,slug.asc', ...extra });
    const r = await fetch(`${url.origin}/rest/v1/${table}?${query}`, {
      headers: { apikey: options.anonKey, 'Accept-Profile': schema },
      cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) throw new Error(`Supabase published-post read HTTP ${r.status}`);
    const rows = await r.json();
    if (!Array.isArray(rows)) throw new Error('Invalid Supabase published-post response');
    return rows.map((row) => {
      if (row.site_id !== options.siteId || row.status !== 'published' || !row.published_at || String(row.published_at).slice(0, 10) > today) throw new Error('Supabase returned an unpublished or foreign post');
      return storedRowToPost(row);
    });
  }
  return {
    async listPublishedPosts(): Promise<ParsedBlogPost[]> {
      const posts: ParsedBlogPost[] = [];
      const seen = new Set<string>();
      while (true) {
        const page = await read({ limit: String(pageSize), offset: String(posts.length) });
        if (!page.length) return posts;
        for (const post of page) {
          if (seen.has(post.slug)) throw new Error('Supabase pagination repeated a post');
          seen.add(post.slug);
          posts.push(post);
        }
      }
    },
    async getPublishedPost(slug: string): Promise<ParsedBlogPost | null> {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
      const rows = await read({ slug: `eq.${slug}`, limit: '1' });
      if (rows[0] && rows[0].slug !== slug) throw new Error('Supabase returned a different slug');
      return rows[0] || null;
    },
  };
}
