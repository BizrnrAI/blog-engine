import type { ParsedBlogFaq, ParsedBlogPost } from './types.js';
/**
 * Registry-driven JSON-LD builders for blog surfaces. One graph per page,
 * stable @ids, and every emitted value mirrors visible page content — never
 * emit facts here that the rendered HTML does not show (machine/visible
 * parity is an ASEO gate). Review/rating schema is deliberately not offered.
 */
export interface BlogSchemaOptions {
    /** Absolute site origin, e.g. https://example.com. Defaults to the configured runtime. */
    siteUrl?: string;
    /** Path prefix for post URLs (default '/blog'). */
    blogBasePath?: string;
    /** Stable person entity for E-E-A-T, e.g. { id: 'https://example.com/#person', name: 'Jane Doe' }. */
    author?: {
        id?: string;
        name: string;
        url?: string;
    };
    /** Stable organization entity, e.g. { id: 'https://example.com/#organization', name: 'Brand', logo: '/logo.png' }. */
    publisher?: {
        id?: string;
        name: string;
        logo?: string;
    };
    /**
     * CSS selectors of the visible quick-answer / citable blocks (e.g. ['.speakable-answer']).
     * Emits a SpeakableSpecification. Only pass selectors your template really renders — schema
     * must mirror visible content.
     */
    speakableSelectors?: readonly string[];
    /** BCP-47 locale for inLanguage (default identity.locale or 'en-US'). */
    locale?: string;
}
/** The Blog node for the hub page; post graphs point at it via isPartOf. */
export declare function blogSchema(options: BlogSchemaOptions & {
    name: string;
    description?: string;
}): JsonLd;
/** ProfilePage + Person for an author page — the verifiable identity behind every post. */
export declare function authorProfileSchema(args: {
    siteUrl?: string;
    path: string;
    id: string;
    name: string;
    jobTitle?: string;
    description?: string;
    image?: string;
    sameAs?: readonly string[];
    worksForId?: string;
}): JsonLd;
type JsonLd = Record<string, unknown>;
export declare function blogPostingSchema(post: ParsedBlogPost, options?: BlogSchemaOptions): JsonLd;
export declare function faqPageSchema(postUrl: string, faqs: readonly ParsedBlogFaq[]): JsonLd;
export declare function breadcrumbSchema(items: readonly {
    name: string;
    path: string;
}[], options?: BlogSchemaOptions): JsonLd;
/**
 * The complete per-post graph: BlogPosting + FAQPage (when the post has FAQs)
 * + breadcrumbs. Serialize with JSON.stringify into a single
 * <script type="application/ld+json"> tag.
 */
export declare function blogPostGraph(post: ParsedBlogPost, options?: BlogSchemaOptions): JsonLd;
export {};
//# sourceMappingURL=schema.d.ts.map