import { getBlogConfig } from './config.js';
/** The Blog node for the hub page; post graphs point at it via isPartOf. */
export function blogSchema(options) {
    const siteUrl = resolveSiteUrl(options);
    const base = options.blogBasePath || '/blog';
    return {
        '@type': 'Blog',
        '@id': `${siteUrl}${base}#blog`,
        url: `${siteUrl}${base}`,
        name: options.name,
        ...(options.description ? { description: options.description } : {}),
        inLanguage: options.locale || configuredLocale(),
        ...(options.publisher?.id ? { publisher: { '@id': options.publisher.id } } : {}),
    };
}
/** ProfilePage + Person for an author page — the verifiable identity behind every post. */
export function authorProfileSchema(args) {
    const siteUrl = resolveSiteUrl({ siteUrl: args.siteUrl });
    const url = absolute(siteUrl, args.path);
    const person = {
        '@type': 'Person',
        '@id': args.id,
        name: args.name,
        url,
        ...(args.jobTitle ? { jobTitle: args.jobTitle } : {}),
        ...(args.description ? { description: args.description } : {}),
        ...(args.image ? { image: absolute(siteUrl, args.image) } : {}),
        ...(args.sameAs?.length ? { sameAs: [...args.sameAs] } : {}),
        ...(args.worksForId ? { worksFor: { '@id': args.worksForId } } : {}),
    };
    return {
        '@context': 'https://schema.org',
        '@graph': [
            { '@type': 'ProfilePage', '@id': `${url}#profile`, url, mainEntity: { '@id': args.id } },
            person,
        ],
    };
}
function resolveSiteUrl(options) {
    if (options.siteUrl)
        return options.siteUrl.replace(/\/$/, '');
    return getBlogConfig().identity.siteUrl.replace(/\/$/, '');
}
function configuredLocale() {
    try {
        return getBlogConfig().identity.locale || 'en-US';
    }
    catch {
        return 'en-US';
    }
}
function configuredAuthor() {
    try {
        return getBlogConfig().identity.author;
    }
    catch {
        return undefined; // standalone use without a configured runtime
    }
}
function absolute(siteUrl, path) {
    return path.startsWith('http') ? path : `${siteUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}
export function blogPostingSchema(post, options = {}) {
    const siteUrl = resolveSiteUrl(options);
    const base = options.blogBasePath || '/blog';
    const url = `${siteUrl}${base}/${post.slug}`;
    const images = [];
    if (post.ogImage)
        images.push(absolute(siteUrl, post.ogImage));
    if (post.heroImage) {
        images.push(post.heroImageWidth && post.heroImageHeight
            ? { '@type': 'ImageObject', url: absolute(siteUrl, post.heroImage), width: post.heroImageWidth, height: post.heroImageHeight }
            : absolute(siteUrl, post.heroImage));
    }
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
        inLanguage: options.locale || configuredLocale(),
        ...(post.content ? { wordCount: post.content.trim().split(/\s+/).filter(Boolean).length } : {}),
        isPartOf: { '@id': `${siteUrl}${base}#blog` },
        ...(images.length ? { image: images } : {}),
        ...(options.speakableSelectors?.length
            ? { speakable: { '@type': 'SpeakableSpecification', cssSelector: [...options.speakableSelectors] } }
            : {}),
    };
    const author = options.author || configuredAuthor();
    if (author) {
        node.author = author.id
            ? { '@id': author.id }
            : { '@type': 'Person', name: author.name, ...(author.url ? { url: author.url } : {}) };
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