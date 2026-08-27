import { markdownToAnswerSections } from './content-reader.js';
/** Map a conventional snake_case content row into the provider-neutral post shape. */
export function storedRowToPost(row) {
    const content = String(row.content || '');
    const answer = String(row.answer || row.description || '');
    return {
        slug: String(row.slug), title: String(row.title || ''), description: String(row.description || ''),
        category: String(row.category || ''), tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
        author: String(row.author || ''), publishedAt: String(row.published_at || '').slice(0, 10),
        updatedAt: String(row.updated_at || row.published_at || '').slice(0, 10),
        heroImage: String(row.hero_image || ''), heroImageAlt: String(row.hero_image_alt || ''),
        heroImageWidth: row.hero_image_width ?? undefined, heroImageHeight: row.hero_image_height ?? undefined,
        heroImageSrcset: row.hero_image_srcset ?? undefined, ogImage: row.og_image ?? undefined,
        readMins: row.read_mins ?? undefined,
        ...(Array.isArray(row.sources) && row.sources.length ? { sources: row.sources } : {}),
        answer, content,
        faqs: Array.isArray(row.faqs)
            ? row.faqs.map((faq) => ({ question: String(faq?.question ?? faq?.q ?? ''), answer: String(faq?.answer ?? faq?.a ?? '') }))
            : [],
        body: markdownToAnswerSections(content, answer),
    };
}
//# sourceMappingURL=stored-row.js.map