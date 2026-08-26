import { rowToPost } from './supabase-store.js';
/**
 * Least-privilege AllWeb store for website repositories and delegated agents.
 *
 * Unlike createSupabaseStore, this adapter never receives a service-role key.
 * It calls the AllWeb site-agent gateway with one revocable token that is
 * irreversibly bound to one site_id. The gateway injects the tenant boundary.
 */
export function createAllWebStore(options) {
    const apiUrl = required(options.apiUrl || process.env.ALLWEB_SITE_AGENT_URL, 'apiUrl (or ALLWEB_SITE_AGENT_URL)');
    const token = required(options.token || process.env.ALLWEB_SITE_TOKEN, 'token (or ALLWEB_SITE_TOKEN)');
    const siteId = required(options.siteId, 'siteId');
    async function call(body) {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ site_id: siteId, ...body }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(`AllWeb ${String(body.action)} ${response.status}: ${String(result.error || 'request_failed')}`);
            Object.assign(error, { status: response.status, code: result.error });
            throw error;
        }
        return result;
    }
    return {
        name: `allweb:${siteId}`,
        async listPosts() {
            const result = await call({
                action: 'blog_list',
                ...(options.includeDrafts ? {} : { status: 'published' }),
                limit: 1000,
                include_content: true,
            });
            return (result.posts || []).map((row) => rowToPost(row));
        },
        async putPost({ post, cover, markdown, dateISO, isRefresh }) {
            let expectedRevision;
            try {
                const current = await call({ action: 'blog_get', slug: post.slug });
                expectedRevision = Number(current.post?.revision);
            }
            catch (error) {
                if (error?.status !== 404)
                    throw error;
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
        async putAsset(key, data, contentType) {
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
function required(value, name) {
    if (!value)
        throw new Error(`AllWeb store: missing ${name}`);
    return value;
}
//# sourceMappingURL=allweb-store.js.map