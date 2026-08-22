import { readGeneratedBlogPosts } from './content-reader.js';
function envOrThrow(name) {
    const v = process.env[name];
    if (!v)
        throw new Error(`missing env ${name}`);
    return v;
}
/** POST {event, url, slug, title, description, image} as JSON to any endpoint. */
export function webhookAdapter(options) {
    return {
        name: options.name || 'webhook',
        async publish(item) {
            const url = options.url || envOrThrow(options.urlEnv || 'SYNDICATION_WEBHOOK_URL');
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
                body: JSON.stringify({ event: 'blog.published', ...item }),
            });
            if (!r.ok)
                throw new Error(`webhook ${r.status}`);
        },
    };
}
/** Slack incoming webhook: one line per post. */
export function slackAdapter(options = {}) {
    return {
        name: 'slack',
        async publish(item) {
            const url = envOrThrow(options.webhookUrlEnv || 'SLACK_WEBHOOK_URL');
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: `${options.prefix || 'New post:'} <${item.url}|${item.title}> — ${item.description}` }),
            });
            if (!r.ok)
                throw new Error(`slack ${r.status}`);
        },
    };
}
/**
 * LinkedIn organization/member article share (UGC Posts API). Needs an access token with
 * w_member_social / w_organization_social and the author URN (urn:li:organization:ID or
 * urn:li:person:ID).
 */
export function linkedinAdapter(options) {
    return {
        name: 'linkedin',
        async publish(item) {
            const token = envOrThrow(options.accessTokenEnv || 'LINKEDIN_ACCESS_TOKEN');
            const text = options.commentary ? options.commentary(item) : `${item.title}\n\n${item.description}`;
            const r = await fetch('https://api.linkedin.com/v2/ugcPosts', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
                body: JSON.stringify({
                    author: options.authorUrn,
                    lifecycleState: 'PUBLISHED',
                    specificContent: {
                        'com.linkedin.ugc.ShareContent': {
                            shareCommentary: { text },
                            shareMediaCategory: 'ARTICLE',
                            media: [{ status: 'READY', originalUrl: item.url, title: { text: item.title }, description: { text: item.description } }],
                        },
                    },
                    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
                }),
            });
            if (!r.ok)
                throw new Error(`linkedin ${r.status}: ${(await r.text()).slice(0, 200)}`);
        },
    };
}
/**
 * Compose adapters into an afterIndexed hook. Post metadata is read from the generated
 * Markdown (title/description/image) so every channel says the same thing as the page.
 */
export function createAfterIndexedHook(adapters, options = {}) {
    return async ({ urls, slugs }) => {
        const posts = options.loadPosts
            ? options.loadPosts()
            : readGeneratedBlogPosts({ root: options.root, blogDir: options.blogDir, fallback: { description: '', author: '', heroImage: '', heroImageAltPrefix: '' } });
        const bySlug = new Map(posts.map((p) => [p.slug, p]));
        for (let i = 0; i < slugs.length; i++) {
            const slug = slugs[i];
            const post = bySlug.get(slug);
            const item = {
                url: urls[i],
                slug,
                title: post?.title || slug,
                description: post?.description || '',
                image: post?.ogImage || post?.heroImage ? new URL(post.ogImage || post.heroImage, options.siteUrl || urls[i]).href : undefined,
            };
            const results = await Promise.allSettled(adapters.map((a) => a.publish(item)));
            results.forEach((res, j) => {
                if (res.status === 'rejected')
                    console.warn(`[blog-syndication] ${adapters[j].name} failed for ${slug}: ${res.reason instanceof Error ? res.reason.message : String(res.reason)}`);
                else
                    console.log(`[blog-syndication] ${adapters[j].name} ok: ${item.url}`);
            });
        }
    };
}
//# sourceMappingURL=syndication.js.map