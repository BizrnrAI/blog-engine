import { getBlogConfig } from './config.js';
function resolveSiteUrl(options) {
    if (options.siteUrl)
        return options.siteUrl.replace(/\/$/, '');
    return getBlogConfig().identity.siteUrl.replace(/\/$/, '');
}
function absolute(siteUrl, path) {
    return path.startsWith('http') ? path : `${siteUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}
export function blogPostingSchema(post, options = {}) {
    const siteUrl = resolveSiteUrl(options);
    const base = options.blogBasePath || '/blog';
    const url = `${siteUrl}${base}/${post.slug}`;
    const images = [post.ogImage, post.heroImage]
        .filter((img) => Boolean(img))
        .map((img) => absolute(siteUrl, img));
    const node = {
        '@type': 'BlogPosting',
        '@id': `${url}#article`,
        headline: post.title,
        description: post.description,
        url,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        datePublished: post.publishedAt,
        dateModified: post.updatedAt || post.publishedAt,
        articleSection: post.category,
        keywords: post.tags.join(', '),
        ...(images.length ? { image: images } : {}),
    };
    if (options.author) {
        node.author = options.author.id
            ? { '@id': options.author.id }
            : { '@type': 'Person', name: options.author.name, ...(options.author.url ? { url: options.author.url } : {}) };
    }
    if (options.publisher) {
        node.publisher = options.publisher.id
            ? { '@id': options.publisher.id }
            : {
                '@type': 'Organization',
                name: options.publisher.name,
                ...(options.publisher.logo
                    ? { logo: { '@type': 'ImageObject', url: absolute(siteUrl, options.publisher.logo) } }
                    : {}),
            };
    }
    return node;
}
export function faqPageSchema(postUrl, faqs) {
    return {
        '@type': 'FAQPage',
        '@id': `${postUrl}#faq`,
        mainEntity: faqs.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
    };
}
export function breadcrumbSchema(items, options = {}) {
    const siteUrl = resolveSiteUrl(options);
    return {
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.name,
            item: absolute(siteUrl, item.path),
        })),
    };
}
/**
 * The complete per-post graph: BlogPosting + FAQPage (when the post has FAQs)
 * + breadcrumbs. Serialize with JSON.stringify into a single
 * <script type="application/ld+json"> tag.
 */
export function blogPostGraph(post, options = {}) {
    const siteUrl = resolveSiteUrl(options);
    const base = options.blogBasePath || '/blog';
    const url = `${siteUrl}${base}/${post.slug}`;
    const graph = [
        blogPostingSchema(post, options),
        breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Blog', path: base },
            { name: post.title, path: `${base}/${post.slug}` },
        ], options),
    ];
    if (post.faqs.length)
        graph.push(faqPageSchema(url, post.faqs));
    return { '@context': 'https://schema.org', '@graph': graph };
}
//# sourceMappingURL=schema.js.map