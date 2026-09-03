import type { BlogEngineHooks, ParsedBlogPost } from './types.js';
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
/** POST {event, url, slug, title, description, image} as JSON to any endpoint. */
export declare function webhookAdapter(options: {
    url?: string;
    urlEnv?: string;
    headers?: Record<string, string>;
    name?: string;
}): SyndicationAdapter;
/** Slack incoming webhook: one line per post. */
export declare function slackAdapter(options?: {
    webhookUrlEnv?: string;
    prefix?: string;
}): SyndicationAdapter;
/**
 * LinkedIn organization/member article share (UGC Posts API). Needs an access token with
 * w_member_social / w_organization_social and the author URN (urn:li:organization:ID or
 * urn:li:person:ID).
 */
export declare function linkedinAdapter(options: {
    authorUrn: string;
    accessTokenEnv?: string;
    commentary?: (item: SyndicationItem) => string;
}): SyndicationAdapter;
/**
 * Compose adapters into an afterIndexed hook. Post metadata is read from the generated
 * Markdown (title/description/image) so every channel says the same thing as the page.
 */
export declare function createAfterIndexedHook(adapters: readonly SyndicationAdapter[], options?: {
    root?: string;
    blogDir?: string;
    siteUrl?: string;
    loadPosts?: () => ParsedBlogPost[] | Promise<ParsedBlogPost[]>;
}): NonNullable<BlogEngineHooks['afterIndexed']>;
//# sourceMappingURL=syndication.d.ts.map