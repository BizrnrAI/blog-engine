import { markdownToAnswerSections } from './content-reader.js';
/**
 * Supabase-backed content store: posts are rows, assets are objects in Storage.
 *
 * Publishing becomes an upsert, so nothing in the publishing path touches git, CI, tokens, or a
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
function required(value, name) {
    if (!value)
        throw new Error(`Supabase store: missing ${name}`);
    return value;
}
function resolve(options) {
    const url = required(options.url || process.env.SUPABASE_URL, 'url (or SUPABASE_URL)').replace(/\/$/, '');
    const key = required(options.serviceKey || process.env.SUPABASE_SERVICE_ROLE_KEY, 'serviceKey (or SUPABASE_SERVICE_ROLE_KEY)');
    return {
        url,
        key,
        siteId: required(options.siteId, 'siteId'),
        table: options.table || 'blog_posts',
        bucket: options.bucket || 'blog-assets',
        schema: options.schema || 'public',
    };
}
export function rowToPost(row) {
    const content = String(row.content || '');
    const answer = String(row.answer || row.description || '');
    return {
        slug: String(row.slug),
        title: String(row.title || ''),
        description: String(row.description || ''),
        category: String(row.category || ''),
        tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
        author: String(row.author || ''),
        publishedAt: String(row.published_at || '').slice(0, 10),
        updatedAt: String(row.updated_at || row.published_at || '').slice(0, 10),
        heroImage: String(row.hero_image || ''),
        heroImageAlt: String(row.hero_image_alt || ''),
        heroImageWidth: row.hero_image_width ?? undefined,
        heroImageHeight: row.hero_image_height ?? undefined,
        heroImageSrcset: row.hero_image_srcset ?? undefined,
        ogImage: row.og_image ?? undefined,
        readMins: row.read_mins ?? undefined,
        ...(Array.isArray(row.sources) && row.sources.length ? { sources: row.sources } : {}),
        answer,
        content,
        faqs: Array.isArray(row.faqs)
            ? row.faqs.map((f) => ({ question: String(f?.question ?? f?.q ?? ''), answer: String(f?.answer ?? f?.a ?? '') }))
            : [],
        body: markdownToAnswerSections(content, answer),
    };
}
export function createSupabaseStore(options) {
    const cfg = resolve(options);
    const headers = {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        'Accept-Profile': cfg.schema,
        'Content-Profile': cfg.schema,
    };
    return {
        name: `supabase:${cfg.table}`,
        async listPosts() {
            const status = options.includeDrafts ? '' : '&status=eq.published';
            const r = await fetch(`${cfg.url}/rest/v1/${cfg.table}?site_id=eq.${encodeURIComponent(cfg.siteId)}${status}&order=published_at.desc&limit=1000`, { headers });
            if (!r.ok)
                throw new Error(`Supabase list ${r.status}: ${(await r.text()).slice(0, 200)}`);
            return (await r.json()).map(rowToPost);
        },
        async putPost({ post, cover, markdown, dateISO, isRefresh }) {
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
                author: options.author ?? null,
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
            const r = await fetch(`${cfg.url}/rest/v1/${cfg.table}?on_conflict=site_id,slug`, {
                method: 'POST',
                headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
                body: JSON.stringify(row),
            });
            if (!r.ok)
                throw new Error(`Supabase upsert ${r.status}: ${(await r.text()).slice(0, 300)}`);
            return `${cfg.table}:${cfg.siteId}/${post.slug}`;
        },
        async putAsset(key, data, contentType) {
            const objectPath = `${cfg.siteId}${key.startsWith('/') ? key : `/${key}`}`.replace(/^\/+/, '');
            const r = await fetch(`${cfg.url}/storage/v1/object/${cfg.bucket}/${objectPath}`, {
                method: 'POST',
                headers: {
                    apikey: cfg.key,
                    Authorization: `Bearer ${cfg.key}`,
                    'Content-Type': contentType,
                    'x-upsert': 'true',
                },
                body: new Uint8Array(data),
            });
            if (!r.ok)
                throw new Error(`Supabase storage ${r.status}: ${(await r.text()).slice(0, 200)}`);
            return options.publicBaseUrl
                ? `${options.publicBaseUrl.replace(/\/$/, '')}/${objectPath}`
                : `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${objectPath}`;
        },
    };
}
//# sourceMappingURL=supabase-store.js.map