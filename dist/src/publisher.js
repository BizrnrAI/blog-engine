import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOG_CONFIG } from './config.js';
import { readExistingPosts } from './existing-posts.js';
import { generateBlogPost } from './generate-post.js';
import { getGscQueries, pingGscSitemap } from './gsc.js';
import { generateCoverImage, gradientForOrdinal } from './images.js';
import { pingIndexNow } from './indexing.js';
import { toMarkdown } from './markdown.js';
import { describeTopic, pickTopic } from './topic-rotation.js';
import { wordCount } from './utils.js';
function ensureDir(path) {
    if (!existsSync(path))
        mkdirSync(path, { recursive: true });
}
export async function generateBlogRun(root, options) {
    const logPrefix = BLOG_CONFIG.logPrefix || '[blog-engine]';
    if (process.env.BLOG_ENGINE_DISABLED === '1') {
        console.log(`${logPrefix} BLOG_ENGINE_DISABLED=1 - exiting without generating.`);
        return { written: [], skipped: 'BLOG_ENGINE_DISABLED' };
    }
    const { token, queries } = await getGscQueries();
    console.log(`${logPrefix} GSC: ${queries.length} candidate queries (top: ${queries.slice(0, 3).map((q) => q.query).join(' | ') || 'none'})`);
    const blogDir = join(root, BLOG_CONFIG.paths.blogDir);
    ensureDir(blogDir);
    const existing = readExistingPosts(root);
    console.log(`${logPrefix} existing posts: ${existing.length}`);
    const written = [];
    for (let i = 0; i < options.count; i++) {
        const topic = pickTopic(existing, queries, i);
        console.log(`${logPrefix} topic #${existing.length + i}: ${describeTopic(topic)}`);
        const post = await generateBlogPost(topic, existing);
        const ordinal = existing.length + i;
        const cover = await generateCoverImage(root, post, topic, ordinal, options.dryRun);
        const gradient = gradientForOrdinal(ordinal);
        const dateISO = new Date().toISOString().slice(0, 10);
        const md = toMarkdown(post, { gradient, cover, dateISO });
        const file = join(blogDir, `${post.slug}.md`);
        if (options.dryRun) {
            console.log(`\n-------- DRY RUN ${file} (${wordCount(post.body)} body words, image: ${cover.source}) --------\n${md}\n-------- END DRY RUN --------\n`);
        }
        else {
            writeFileSync(file, md, 'utf8');
            console.log(`${logPrefix} wrote ${file} (image: ${cover.source}, og: ${cover.ogImage})`);
            written.push(post.slug);
            existing.push({ slug: post.slug, title: post.title });
        }
    }
    if (!options.dryRun && !options.skipPing && written.length) {
        await pingIndexNow(written.map((slug) => `${BLOG_CONFIG.identity.siteUrl}/blog/${slug}`));
        await pingGscSitemap(token);
    }
    return { written };
}
//# sourceMappingURL=publisher.js.map