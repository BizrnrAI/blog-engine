import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOG_CONFIG, blogPostUrl, getBlogHooks } from './config.js';
import { listExistingPosts } from './store.js';
import { getStore } from './store.js';
import { generateBlogPost } from './generate-post.js';
import { getGscQueries, pingGscSitemap } from './gsc.js';
import { generateCoverImage, gradientForOrdinal } from './images.js';
import { pingIndexNow } from './indexing.js';
import { toMarkdown } from './markdown.js';
import { contentRules } from './generate-post.js';
import { contentExtensions } from './content-reader.js';
import { hasSecondDemandSignal } from './demand.js';
import { describeTopic, resolveTopic } from './topic-rotation.js';
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

  const { token, queries: gscQueries } = await getGscQueries();
  let queries = gscQueries;
  if (contentRules().requireTwoDemandSignals && queries.length) {
    // ASEO: two independent demand sources before a new URL. Check the top candidates only.
    const kept: typeof queries = [];
    for (const q of queries.slice(0, 15)) {
      if (await hasSecondDemandSignal(q.query)) kept.push(q);
      else console.log(`${logPrefix} demand gate: no second signal for "${q.query}" - skipped`);
    }
    queries = kept;
  }
  console.log(`${logPrefix} GSC: ${queries.length} candidate queries (top: ${queries.slice(0, 3).map((q) => q.query).join(' | ') || 'none'})`);

  const blogDir = join(root, BLOG_CONFIG.paths.blogDir);
  // Only a filesystem store needs a content directory. A dry run must not touch the filesystem
  // either — it previously created the directory before deciding it wasn't going to write
  // anything, which litters a repo just for previewing a post.
  if (!options.dryRun && getStore(root).root) ensureDir(blogDir);
  const existing = await listExistingPosts(root);
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
    const topic = await resolveTopic(existing, queries, i);
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
    const file = join(blogDir, `${post.slug}${contentExtensions()[0]}`);

    if (options.dryRun) {
      console.log(`\n-------- DRY RUN ${file} (${wordCount(post.body)} body words, image: ${cover.source}) --------\n${md}\n-------- END DRY RUN --------\n`);
    } else {
      // Persistence order: an explicit persistPost hook wins, then the configured store
      // (filesystem by default). Both paths log the same way so a run reads identically
      // whether the post landed as a file or a row.
      const persist = getBlogHooks().persistPost;
      let target: string;
      if (persist) {
        const alsoWriteFile = (await persist({ post, cover, markdown: md, file, root, isRefresh: false })) === true;
        if (alsoWriteFile) writeFileSync(file, md, 'utf8');
        target = alsoWriteFile ? file : post.slug;
      } else {
        target = await getStore(root).putPost({ post, cover, markdown: md, dateISO, isRefresh: false });
      }
      console.log(`${logPrefix} published ${target} (image: ${cover.source}, og: ${cover.ogImage})`);
      written.push(post.slug);
      existing.push({ slug: post.slug, title: post.title });
    }
  }

  if (!options.dryRun && !options.skipPing && written.length) {
    await pingIndexNow(written.map(blogPostUrl));
    await pingGscSitemap(token);
  }

  return { written };
}
