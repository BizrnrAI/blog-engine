import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
function stripQuotes(value) {
    return value.trim().replace(/^['"]|['"]$/g, '');
}
export function parseBlogFrontmatter(raw) {
    if (!raw.startsWith('---'))
        return { frontmatter: {}, content: raw.trim(), faqs: [], tags: [], sources: [] };
    const end = raw.indexOf('\n---', 3);
    if (end === -1)
        return { frontmatter: {}, content: raw.trim(), faqs: [], tags: [], sources: [] };
    const yaml = raw.slice(3, end).trim();
    const content = raw.slice(end + 4).trim();
    const frontmatter = {};
    const faqs = [];
    const tags = [];
    const sources = [];
    let currentFaq = null;
    let currentSource = null;
    let currentList = null;
    for (const line of yaml.split('\n')) {
        if (line.startsWith('  - q:')) {
            currentFaq = { question: stripQuotes(line.replace('  - q:', '')) };
            faqs.push(currentFaq);
            continue;
        }
        if (line.startsWith('    a:') && currentFaq) {
            currentFaq.answer = stripQuotes(line.replace('    a:', ''));
            continue;
        }
        if (currentList === 'sources' && /^\s+-\s+title:/.test(line)) {
            currentSource = { title: stripQuotes(line.replace(/^\s+-\s+title:/, '')), url: '' };
            sources.push(currentSource);
            continue;
        }
        if (currentList === 'sources' && currentSource && /^\s+url:/.test(line)) {
            currentSource.url = stripQuotes(line.replace(/^\s+url:/, ''));
            continue;
        }
        if (currentList === 'sources' && currentSource && /^\s+publisher:/.test(line)) {
            currentSource.publisher = stripQuotes(line.replace(/^\s+publisher:/, ''));
            continue;
        }
        if (currentList === 'tags' && /^\s+-\s/.test(line)) {
            const tag = stripQuotes(line.replace(/^\s+-\s*/, ''));
            if (tag)
                tags.push(tag);
            continue;
        }
        const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (match) {
            currentList = match[1] === 'tags' ? 'tags' : match[1] === 'faqs' ? 'faqs' : match[1] === 'sources' ? 'sources' : null;
            const value = stripQuotes(match[2] || '');
            // Inline lists like `tags: [a, b]` are also accepted.
            if (match[1] === 'tags' && /^\[.*\]$/.test(match[2] || '')) {
                tags.push(...(match[2] || '').slice(1, -1).split(',').map((t) => stripQuotes(t)).filter(Boolean));
            }
            else {
                frontmatter[match[1]] = value;
            }
        }
    }
    return {
        frontmatter,
        content,
        faqs: faqs.filter((faq) => faq.question && faq.answer),
        tags,
        sources: sources.filter((s) => s.title && s.url),
    };
}
export function markdownToAnswerSections(content, fallbackAnswer) {
    const chunks = content
        .split(/\n(?=##\s+)/g)
        .map((chunk) => chunk.trim())
        .filter(Boolean);
    if (!chunks.length) {
        return [{ heading: 'What should readers know?', answer: fallbackAnswer, body: content }];
    }
    return chunks.map((chunk, index) => {
        const headingMatch = chunk.match(/^##\s+(.+)$/m);
        const heading = headingMatch?.[1]?.trim() || (index === 0 ? 'Overview' : `Section ${index + 1}`);
        const body = chunk.replace(/^##\s+.+$/m, '').trim();
        const firstParagraph = body.split(/\n{2,}/).find((part) => part.trim())?.trim() || fallbackAnswer;
        return { heading, answer: index === 0 ? fallbackAnswer : firstParagraph, body };
    });
}
export function readGeneratedBlogPosts(options = {}) {
    const root = options.root || process.cwd();
    const blogDir = join(root, options.blogDir || 'src/content/blog');
    const fallback = options.fallback;
    if (!existsSync(blogDir))
        return [];
    return readdirSync(blogDir)
        .filter((file) => file.endsWith('.md') && !file.startsWith('_'))
        .map((file) => {
        const slug = file.replace(/\.md$/, '');
        const raw = readFileSync(join(blogDir, file), 'utf8');
        const { frontmatter, content, faqs, tags, sources } = parseBlogFrontmatter(raw);
        const title = frontmatter.title || fallback?.title || slug.replace(/-/g, ' ');
        const publishedAt = frontmatter.date || frontmatter.pubDate || new Date().toISOString().slice(0, 10);
        const description = frontmatter.description || fallback?.description || title;
        const answer = frontmatter.answer || description;
        return {
            slug,
            title,
            description,
            category: frontmatter.category || fallback?.category || 'Service Guides',
            tags: tags.length ? tags : fallback?.tags || [frontmatter.category || 'Service Guides'],
            author: frontmatter.author || fallback?.author || '',
            publishedAt,
            updatedAt: frontmatter.updated || frontmatter.updatedDate || publishedAt,
            heroImage: frontmatter.image || frontmatter.heroImage || frontmatter.cover || fallback?.heroImage || '',
            heroImageAlt: frontmatter.imageAlt || frontmatter.heroAlt || frontmatter.coverAlt || `${fallback?.heroImageAltPrefix || 'Blog'} guide: ${title}`,
            heroImageWidth: Number(frontmatter.imageWidth) || undefined,
            heroImageHeight: Number(frontmatter.imageHeight) || undefined,
            heroImageSrcset: frontmatter.imageSrcset || undefined,
            ...(sources.length ? { sources } : {}),
            ogImage: frontmatter.ogImage || undefined,
            readMins: Number(frontmatter.readMins) || undefined,
            answer,
            content,
            faqs,
            body: markdownToAnswerSections(content, answer),
        };
    });
}
export function mergeBlogPosts(seedPosts, generatedPosts) {
    const posts = new Map();
    for (const post of seedPosts)
        posts.set(post.slug, post);
    for (const post of generatedPosts)
        posts.set(post.slug, post);
    return Array.from(posts.values()).sort((a, b) => new Date(b.updatedAt || b.publishedAt).getTime() - new Date(a.updatedAt || a.publishedAt).getTime());
}
//# sourceMappingURL=content-reader.js.map