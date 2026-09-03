import { assertNoEmDashes } from './punctuation.js';
import type { BlogStore, ParsedBlogPost, PutPostArgs, SupabaseStoreOptions } from './types.js';
import { storedRowToPost } from './stored-row.js';

/**
 * Supabase-backed content store: posts are rows, assets are objects in Storage.
 *
 * Publishing becomes a database write, so nothing in the publishing path touches git, CI, tokens, or a
 * site rebuild — the site renders the row on its next request (ISR) and a rollback is a status
 * flip rather than a revert commit.
 *
 * Deliberately implemented with `fetch` against PostgREST and the Storage REST API: no
 * `@supabase/supabase-js` dependency, nothing new to keep current, and it runs anywhere fetch
 * does. The service-role key is required (RLS blocks anonymous writes by design) and must never
 * reach a browser bundle — this store belongs in the generation service, not in site render code.
 *
 * Schema: see sql/0001_blog_posts.sql. One table serves every site, partitioned by `site_id`.
 */

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Supabase store: missing ${name}`);
  return value;
}

function resolve(options: SupabaseStoreOptions) {
  const url = required(options.url || process.env.SUPABASE_URL, 'url (or SUPABASE_URL)').replace(/\/$/, '');
  const key = required(
    options.serviceKey || process.env.SUPABASE_SERVICE_ROLE_KEY,
    'serviceKey (or SUPABASE_SERVICE_ROLE_KEY)',
  );
  if (!/^https?:$/.test(new URL(url).protocol)) throw new Error('Supabase store: invalid URL');
  if (!/^[a-z_][a-z0-9_]*$/i.test(options.table || 'blog_posts') || !/^[a-z_][a-z0-9_]*$/i.test(options.schema || 'public')) throw new Error('Supabase store: invalid table/schema identifier');
  return {
    url,
    key,
    siteId: required(options.siteId, 'siteId'),
    table: options.table || 'blog_posts',
    bucket: options.bucket || 'blog-assets',
    schema: options.schema || 'public',
  };
}

/** @deprecated Compatibility alias for earlier internal imports. */
export const rowToPost = storedRowToPost;

export function createSupabaseStore(options: SupabaseStoreOptions): BlogStore {
  const cfg = resolve(options);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const pageSize = options.pageSize ?? 200;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) throw new Error('Supabase store: invalid timeoutMs');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error('Supabase store: invalid pageSize');
  const headers = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    'Content-Type': 'application/json',
    'Accept-Profile': cfg.schema,
    'Content-Profile': cfg.schema,
  };

  return {
    name: `supabase:${cfg.table}`,
    publicationStatus: options.publishStatus || 'published',
    assetOrigins: [new URL(options.publicBaseUrl || cfg.url).origin],
    async listPosts(): Promise<ParsedBlogPost[]> {
      const posts: ParsedBlogPost[] = [];
      let offset = 0;
      const seen = new Set<string>();
      while (true) {
        const query = new URLSearchParams({ site_id: `eq.${cfg.siteId}`, order: 'published_at.desc,slug.asc', limit: String(pageSize), offset: String(offset) });
        if (!options.includeDrafts) query.set('status', 'eq.published');
        const r = await fetch(`${cfg.url}/rest/v1/${cfg.table}?${query}`, { headers, signal: AbortSignal.timeout(timeoutMs) });
        if (!r.ok) throw new Error(`Supabase list HTTP ${r.status}`);
        const rows = await r.json();
        if (!Array.isArray(rows)) throw new Error('Supabase list returned an invalid corpus');
        for (const row of rows) {
          if (row.site_id !== cfg.siteId) throw new Error('Supabase list returned a foreign tenant');
          if (!options.includeDrafts && row.status !== 'published') throw new Error('Supabase list returned a non-published row');
          if (seen.has(row.slug)) throw new Error('Supabase pagination repeated a post');
          seen.add(row.slug);
          posts.push(storedRowToPost(row));
        }
        if (rows.length === 0) break;
        offset += rows.length;
      }
      return posts;
    },

    async putPost({ post, cover, markdown, dateISO, isRefresh }: PutPostArgs): Promise<string> {
      assertNoEmDashes({ post, cover, markdown, author: options.author });
      // The row carries the structured post; `content` keeps the Markdown body so a site can
      // render it, and `markdown` keeps the exact file the engine would have written, which
      // makes a later export back to files lossless.
      const row = {
        site_id: cfg.siteId,
        slug: post.slug,
        title: post.title,
        description: post.description,
        category: post.category,
        tags: post.tags,
        answer: post.answer,
        content: post.body,
        markdown,
        read_mins: post.readMins,
        ...(isRefresh && options.author === undefined ? {} : { author: options.author ?? null }),
        faqs: post.faqs.map((f) => ({ question: f.q, answer: f.a })),
        sources: post.sources ?? [],
        hero_image: cover.image || null,
        hero_image_alt: cover.imageAlt || null,
        hero_image_width: cover.width ?? null,
        hero_image_height: cover.height ?? null,
        hero_image_srcset: cover.srcset ?? null,
        og_image: cover.ogImage || null,
        status: options.publishStatus || 'published',
        // A refresh keeps its original publish date; only `updated_at` moves.
        ...(isRefresh ? {} : { published_at: dateISO }),
        updated_at: dateISO,
      };
      // New posts INSERT and fail on duplicate slugs. Refreshes UPDATE one existing published
      // row, never recreate deleted content, reset its publication date, or unpublish it.
      const query = new URLSearchParams({ site_id: `eq.${cfg.siteId}`, slug: `eq.${post.slug}`, status: 'eq.published' });
      if (isRefresh && options.publishStatus === 'draft') throw new Error('Supabase refresh cannot unpublish a live row');
      const r = await fetch(`${cfg.url}/rest/v1/${cfg.table}${isRefresh ? `?${query}` : ''}`, {
        method: isRefresh ? 'PATCH' : 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { ...headers, Prefer: isRefresh ? 'return=representation' : 'return=minimal' },
        body: JSON.stringify(row),
      });
      if (!r.ok) throw new Error(`Supabase ${isRefresh ? 'refresh' : 'insert'} HTTP ${r.status}`);
      if (isRefresh) {
        const updated = await r.json();
        if (!Array.isArray(updated) || updated.length !== 1 || updated[0].site_id !== cfg.siteId || updated[0].slug !== post.slug) {
          throw new Error('Supabase refresh did not update exactly one matching published post');
        }
      }
      return `${cfg.table}:${cfg.siteId}/${post.slug}`;
    },

    async putAsset(key: string, data: Buffer, contentType: string): Promise<string> {
      if (key.includes('://') || key.split('/').some((part) => part === '..' || part === '.')) throw new Error('Supabase asset key must be a relative object path');
      const objectPath = `${cfg.siteId}${key.startsWith('/') ? key : `/${key}`}`.replace(/^\/+/, '');
      const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
      const r = await fetch(`${cfg.url}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${encodedPath}`, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          apikey: cfg.key,
          Authorization: `Bearer ${cfg.key}`,
          'Content-Type': contentType,
          'x-upsert': 'true',
        },
        body: new Uint8Array(data),
      });
      if (!r.ok) throw new Error(`Supabase storage ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return options.publicBaseUrl
        ? `${options.publicBaseUrl.replace(/\/$/, '')}/${encodedPath}`
        : `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${encodedPath}`;
    },
  };
}
