import { getBlogConfig } from './config.js';
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
  author?: { id?: string; name: string; url?: string };
  /** Stable organization entity, e.g. { id: 'https://example.com/#organization', name: 'Brand', logo: '/logo.png' }. */
  publisher?: { id?: string; name: string; logo?: string };
  /**
   * CSS selectors of the visible quick-answer / citable blocks (e.g. ['.speakable-answer']).
   * Emits a SpeakableSpecification. Only pass selectors your template really renders — schema
   * must mirror visible content.
   */
  speakableSelectors?: readonly string[];
}

type JsonLd = Record<string, unknown>;

function resolveSiteUrl(options: BlogSchemaOptions): string {
  if (options.siteUrl) return options.siteUrl.replace(/\/$/, '');
  return getBlogConfig().identity.siteUrl.replace(/\/$/, '');
}

function configuredAuthor(): BlogSchemaOptions['author'] | undefined {
  try {
    return getBlogConfig().identity.author;
  } catch {
    return undefined; // standalone use without a configured runtime
  }
}

function absolute(siteUrl: string, path: string): string {
  return path.startsWith('http') ? path : `${siteUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

export function blogPostingSchema(post: ParsedBlogPost, options: BlogSchemaOptions = {}): JsonLd {
  const siteUrl = resolveSiteUrl(options);
  const base = options.blogBasePath || '/blog';
  const url = `${siteUrl}${base}/${post.slug}`;
  const images: unknown[] = [];
  if (post.ogImage) images.push(absolute(siteUrl, post.ogImage));
  if (post.heroImage) {
    images.push(
      post.heroImageWidth && post.heroImageHeight
        ? { '@type': 'ImageObject', url: absolute(siteUrl, post.heroImage), width: post.heroImageWidth, height: post.heroImageHeight }
        : absolute(siteUrl, post.heroImage),
    );
  }

  const node: JsonLd = {
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

export function faqPageSchema(postUrl: string, faqs: readonly ParsedBlogFaq[]): JsonLd {
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

export function breadcrumbSchema(
  items: readonly { name: string; path: string }[],
  options: BlogSchemaOptions = {},
): JsonLd {
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
export function blogPostGraph(post: ParsedBlogPost, options: BlogSchemaOptions = {}): JsonLd {
  const siteUrl = resolveSiteUrl(options);
  const base = options.blogBasePath || '/blog';
  const url = `${siteUrl}${base}/${post.slug}`;
  const graph: JsonLd[] = [
    blogPostingSchema(post, options),
    breadcrumbSchema(
      [
        { name: 'Home', path: '/' },
        { name: 'Blog', path: base },
        { name: post.title, path: `${base}/${post.slug}` },
      ],
      options,
    ),
  ];
  if (post.faqs.length) graph.push(faqPageSchema(url, post.faqs));
  return { '@context': 'https://schema.org', '@graph': graph };
}
