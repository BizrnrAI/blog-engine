import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOG_CONFIG, blogBasePath, getBlogHooks } from './config.js';
import { readExistingPosts } from './existing-posts.js';
import { generateBlogPost } from './generate-post.js';
import { getGscQueries, pingGscSitemap } from './gsc.js';
import { generateCoverImage, gradientForOrdinal } from './images.js';
import { pingIndexNow } from './indexing.js';
import { toMarkdown } from './markdown.js';
import { contentRules } from './generate-post.js';
import { describeTopic, pickTopic } from './topic-rotation.js';
import type { GenerateRunOptions, GenerateRunResult } from './types.js';
import { wordCount } from './utils.js';

export function countPostsSince(existing: readonly { date?: string }[], days: number, now = new Date()): number {
  const cutoff = now.getTime() - days * 864e5;
  return existing.filter((p) => p.date && !Number.isNaN(Date.parse(p.date)) && Date.parse(p.date) >= cutoff).length;
}

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

export async function generateBlogRun(root: string, options: GenerateRunOptions): Promise<GenerateRunResult> {
  const logPrefix = BLOG_CONFIG.logPrefix || '[blog-engine]';
  if (process.env.BLOG_ENGINE_DISABLED === '1') {
    console.log(`${logPrefix} BLOG_ENGINE_DISABLED=1 - exiting without generating.`);
    return { written: [], skipped: 'BLOG_ENGINE_DISABLED' };
  }

  const { token, queries } = await getGscQueries();
  console.log(`${logPrefix} GSC: ${queries.length} candidate queries (top: ${queries.slice(0, 3).map((q) => q.query).join(' | ') || 'none'})`);

  const blogDir = join(root, BLOG_CONFIG.paths.blogDir);
  // A dry run must not touch the filesystem — it previously created the content directory before
  // deciding it wasn't going to write anything, which litters a repo just for previewing a post.
  if (!options.dryRun) ensureDir(blogDir);
  const existing = readExistingPosts(root);
  console.log(`${logPrefix} existing posts: ${existing.length}`);

  // Cadence guard (ASEO: cap search-led autonomous posts until reviewed evidence supports more).
  const maxPerWeek = contentRules().maxPostsPerWeek;
  if (maxPerWeek && maxPerWeek > 0) {
    const recent = countPostsSince(existing, 7);
    if (recent >= maxPerWeek) {
      console.log(`${logPrefix} cadence cap reached (${recent}/${maxPerWeek} posts in the last 7 days) - skipping run.`);
      return { written: [], skipped: 'CADENCE_CAP' };
    }
  }

  const written: string[] = [];
  for (let i = 0; i < options.count; i++) {
    const topic = pickTopic(existing, queries, i);
    console.log(`${logPrefix} topic #${existing.length + i}: ${describeTopic(topic)}`);
    const post = await generateBlogPost(topic, existing);
    const ordinal = existing.length + i;
    const cover = await generateCoverImage(root, post, topic, ordinal, options.dryRun);
    const gradient = gradientForOrdinal(ordinal);
    const dateISO = new Date().toISOString().slice(0, 10);
    // The consuming site may own its own frontmatter shape; the engine still owns everything
    // around it (generation, validation, watermarking, encoding, the write).
    const author = BLOG_CONFIG.identity.author?.name;
    const renderMarkdown = getBlogHooks().renderMarkdown;
    const md = renderMarkdown
      ? renderMarkdown({ post, cover, gradient, dateISO, author })
      : toMarkdown(post, { gradient, cover, dateISO, author });
    const file = join(blogDir, `${post.slug}.md`);

    if (options.dryRun) {
      console.log(`\n-------- DRY RUN ${file} (${wordCount(post.body)} body words, image: ${cover.source}) --------\n${md}\n-------- END DRY RUN --------\n`);
    } else {
      writeFileSync(file, md, 'utf8');
      console.log(`${logPrefix} wrote ${file} (image: ${cover.source}, og: ${cover.ogImage})`);
      written.push(post.slug);
      existing.push({ slug: post.slug, title: post.title });
    }
  }

  if (!options.dryRun && !options.skipPing && written.length) {
    await pingIndexNow(written.map((slug) => `${BLOG_CONFIG.identity.siteUrl}${blogBasePath()}/${slug}`));
    await pingGscSitemap(token);
  }

  return { written };
}
