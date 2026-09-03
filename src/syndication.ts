import { getStore } from './store.js';
import type { AfterIndexedArgs, BlogEngineHooks, ParsedBlogPost } from './types.js';

/**
 * Distribution adapters for the afterIndexed seam. Every adapter receives a post that is
 * already LIVE and SUBMITTED; failures are logged and never affect publishing. Generic webhook
 * (Zapier/Make/n8n/custom) covers any network you can't reach natively; Slack and LinkedIn are
 * built in. X/Twitter needs OAuth 1.0a request signing and is intentionally left to the webhook
 * route or a custom adapter.
 */
export interface SyndicationItem {
  url: string;
  slug: string;
  title: string;
  description: string;
  image?: string;
}

export interface SyndicationAdapter {
  name: string;
  publish: (item: SyndicationItem) => Promise<void>;
}

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

/** POST {event, url, slug, title, description, image} as JSON to any endpoint. */
export function webhookAdapter(options: { url?: string; urlEnv?: string; headers?: Record<string, string>; name?: string }): SyndicationAdapter {
  return {
    name: options.name || 'webhook',
    async publish(item) {
      const url = options.url || envOrThrow(options.urlEnv || 'SYNDICATION_WEBHOOK_URL');
      const r = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        body: JSON.stringify({ event: 'blog.published', ...item }),
      });
      if (!r.ok) throw new Error(`webhook ${r.status}`);
    },
  };
}

/** Slack incoming webhook: one line per post. */
export function slackAdapter(options: { webhookUrlEnv?: string; prefix?: string } = {}): SyndicationAdapter {
  return {
    name: 'slack',
    async publish(item) {
      const url = envOrThrow(options.webhookUrlEnv || 'SLACK_WEBHOOK_URL');
      const r = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `${options.prefix || 'New post:'} <${item.url}|${item.title}> — ${item.description}` }),
      });
      if (!r.ok) throw new Error(`slack ${r.status}`);
    },
  };
}

/**
 * LinkedIn organization/member article share (UGC Posts API). Needs an access token with
 * w_member_social / w_organization_social and the author URN (urn:li:organization:ID or
 * urn:li:person:ID).
 */
export function linkedinAdapter(options: { authorUrn: string; accessTokenEnv?: string; commentary?: (item: SyndicationItem) => string }): SyndicationAdapter {
  return {
    name: 'linkedin',
    async publish(item) {
      const token = envOrThrow(options.accessTokenEnv || 'LINKEDIN_ACCESS_TOKEN');
      const text = options.commentary ? options.commentary(item) : `${item.title}\n\n${item.description}`;
      const r = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
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
      if (!r.ok) throw new Error(`linkedin ${r.status}: ${(await r.text()).slice(0, 200)}`);
    },
  };
}

/**
 * Compose adapters into an afterIndexed hook. Post metadata is read from the generated
 * Markdown (title/description/image) so every channel says the same thing as the page.
 */
export function createAfterIndexedHook(
  adapters: readonly SyndicationAdapter[],
  options: { root?: string; blogDir?: string; siteUrl?: string; loadPosts?: () => ParsedBlogPost[] | Promise<ParsedBlogPost[]> } = {},
): NonNullable<BlogEngineHooks['afterIndexed']> {
  return async ({ urls, slugs }: AfterIndexedArgs) => {
    const posts = options.loadPosts
      ? await options.loadPosts()
      : await getStore(options.root || process.cwd()).listPosts();
    const bySlug = new Map(posts.map((p) => [p.slug, p]));
    for (let i = 0; i < slugs.length; i++) {
      const slug = slugs[i];
      const post = bySlug.get(slug);
      const item: SyndicationItem = {
        url: urls[i],
        slug,
        title: post?.title || slug,
        description: post?.description || '',
        image: post?.ogImage || post?.heroImage ? new URL(post!.ogImage || post!.heroImage, options.siteUrl || urls[i]).href : undefined,
      };
      const results = await Promise.allSettled(adapters.map((a) => a.publish(item)));
      results.forEach((res, j) => {
        if (res.status === 'rejected') console.warn(`[blog-syndication] ${adapters[j].name} failed for ${slug}: ${res.reason instanceof Error ? res.reason.message : String(res.reason)}`);
        else console.log(`[blog-syndication] ${adapters[j].name} ok: ${item.url}`);
      });
    }
  };
}
