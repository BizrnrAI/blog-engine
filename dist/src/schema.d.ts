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
}
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