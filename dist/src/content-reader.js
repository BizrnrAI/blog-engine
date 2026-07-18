import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
function stripQuotes(value) {
    return value.trim().replace(/^['"]|['"]$/g, '');
}
export function parseBlogFrontmatter(raw) {
    if (!raw.startsWith('---'))
        return { frontmatter: {}, content: raw.trim(), faqs: [], tags: [] };
    const end = raw.indexOf('\n---', 3);
    if (end === -1)
        return { frontmatter: {}, content: raw.trim(), faqs: [], tags: [] };
    const yaml = raw.slice(3, end).trim();
    const content = raw.slice(end + 4).trim();
    const frontmatter = {};
    const faqs = [];
    const tags = [];
    let currentFaq = null;
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
        if (currentList === 'tags' && /^\s+-\s/.test(line)) {
            const tag = stripQuotes(line.replace(/^\s+-\s*/, ''));
            if (tag)
                tags.push(tag);
            continue;
        }
        const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (match) {
            currentList = match[1] === 'tags' ? 'tags' : match[1] === 'faqs' ? 'faqs' : null;
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
        const { frontmatter, content, faqs, tags } = parseBlogFrontmatter(raw);
        const title = frontmatter.title || fallback?.title || slug.replace(/-/g, ' ');
        const publishedAt = frontmatter.date || new Date().toISOString().slice(0, 10);
        const description = frontmatter.description || fallback?.description || title;
        const answer = frontmatter.answer || description;
        return {
            slug,
            title,
            description,
            category: frontmatter.category || fallback?.category || 'Service Guides',
            tags: tags.length ? tags : fallback?.tags || [frontmatter.category || 'Service Guides'],
            author: fallback?.author || '',
            publishedAt,
            updatedAt: frontmatter.updated || publishedAt,
            heroImage: frontmatter.image || fallback?.heroImage || '',
            heroImageAlt: frontmatter.imageAlt || `${fallback?.heroImageAltPrefix || 'Blog'} guide: ${title}`,
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