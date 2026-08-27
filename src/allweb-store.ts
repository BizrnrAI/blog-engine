import type { AllWebStoreOptions, BlogStore, ParsedBlogPost, PutPostArgs } from './types.js';
import { storedRowToPost } from './stored-row.js';

/**
 * Least-privilege AllWeb store for website repositories and delegated agents.
 *
 * Unlike createSupabaseStore, this adapter never receives a service-role key.
 * It calls the AllWeb site-agent gateway with one revocable token that is
 * irreversibly bound to one site_id. The gateway injects the tenant boundary.
 */
export function createAllWebStore(options: AllWebStoreOptions): BlogStore {
  const apiUrl = required(options.apiUrl || process.env.ALLWEB_SITE_AGENT_URL, 'apiUrl (or ALLWEB_SITE_AGENT_URL)');
  const token = required(options.token || process.env.ALLWEB_SITE_TOKEN, 'token (or ALLWEB_SITE_TOKEN)');
  const siteId = required(options.siteId, 'siteId');
  const timeoutMs = boundedInteger(options.timeoutMs, 100, 60_000, 8_000, 'timeoutMs');
  const pageSize = boundedInteger(options.pageSize, 1, 250, 200, 'pageSize');

  async function call(body: Record<string, unknown>): Promise<Record<string, any>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        // Tenant selection is deliberately absent. AllWeb derives site_id from
        // the scoped token and rejects attempts to address another website.
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

  return {
    name: `allweb:${siteId}`,
    publicationStatus: options.publishStatus || 'published',

    async listPosts(): Promise<ParsedBlogPost[]> {
      const posts: ParsedBlogPost[] = [];
      let offset = 0;
      while (true) {
        const result = await call({
          action: 'blog_list',
          ...(options.includeDrafts ? {} : { status: 'published' }),
          limit: pageSize, offset, include_content: true,
        });
        const rows = Array.isArray(result.posts) ? result.posts : [];
        for (const row of rows) {
          if (String(row.site_id || '') !== siteId) throw new Error(`AllWeb tenant violation: received site_id ${String(row.site_id || '<missing>')}`);
          // Unfiltered editorial reads include archived rows. They are retained
          // for audit history, but must not consume cadence or topic ownership.
          if (String(row.status || '') === 'archived') continue;
          posts.push(storedRowToPost(row));
        }
        const pagination = result.pagination && typeof result.pagination === 'object' ? result.pagination : null;
        const hasMore = pagination ? pagination.has_more === true : rows.length === pageSize;
        if (!hasMore || rows.length === 0) break;
        const next = Number(pagination?.next_offset ?? offset + rows.length);
        if (!Number.isInteger(next) || next <= offset) throw new Error('AllWeb blog_list returned invalid pagination');
        offset = next;
      }
      return posts;
    },

    async putPost({ post, cover, markdown, dateISO, isRefresh }: PutPostArgs): Promise<string> {
      let expectedRevision: number | undefined;
      try {
        const current = await call({ action: 'blog_get', slug: post.slug });
        expectedRevision = Number(current.post?.revision);
      } catch (error: any) {
        if (error?.status !== 404) throw error;
      }

      const result = await call({
        action: 'blog_upsert',
        slug: post.slug,
        title: post.title,
        description: post.description,
        category: post.category,
        tags: post.tags,
        answer: post.answer,
        content: post.body,
        markdown,
        read_mins: post.readMins,
        author: options.author || null,
        faqs: post.faqs.map((faq) => ({ question: faq.q, answer: faq.a })),
        sources: post.sources || [],
        hero_image: cover.image || null,
        hero_image_alt: cover.imageAlt || null,
        hero_image_width: cover.width ?? null,
        hero_image_height: cover.height ?? null,
        hero_image_srcset: cover.srcset ?? null,
        og_image: cover.ogImage || null,
        status: options.publishStatus || 'published',
        published_at: isRefresh ? undefined : dateISO,
        ...(expectedRevision ? { expected_revision: expectedRevision } : {}),
        metadata: { engine: '@bizrnr/blog-engine', store: 'allweb' },
      });
      return `allweb:${siteId}/${String(result.post?.slug || post.slug)}`;
    },

    async putAsset(key: string, data: Buffer, contentType: string): Promise<string> {
      const result = await call({
        action: 'blog_asset_upload',
        path: key.replace(/^\/+/, ''),
        content_type: contentType,
        data_base64: data.toString('base64'),
        metadata: { engine: '@bizrnr/blog-engine' },
      });
      return String(result.asset?.public_url || '');
    },
  };
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`AllWeb store: missing ${name}`);
  return value;
}

function boundedInteger(value: number | undefined, min: number, max: number, fallback: number, name: string): number {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`AllWeb store: invalid ${name}`);
  return value;
}
