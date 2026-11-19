import { BlogRunError } from './run-error.js';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOG_CONFIG, blogHubUrl, getBlogHooks } from './config.js';
import { getStore, listExistingPosts } from './store.js';
import { contentRules, generateBlogPost } from './generate-post.js';
import { getGscQueries } from './gsc.js';
import { generateCoverImage, gradientForOrdinal } from './images.js';
import { submitBlogDiscovery } from './indexing.js';
import { toMarkdown } from './markdown.js';
import { contentExtensions } from './content-reader.js';
import { hasSecondDemandSignal } from './demand.js';
import { describeTopic, resolveTopic } from './topic-rotation.js';
import type { GenerateRunOptions, GenerateRunResult } from './types.js';
import { assertNoEmDashes } from './punctuation.js';
import { wordCount } from './utils.js';

export function countPostsSince(existing: readonly { date?: string }[], days: number, now = new Date()): number {
  const cutoff = now.getTime() - days * 864e5;
  return existing.filter((p) => p.date && !Number.isNaN(Date.parse(p.date)) && Date.parse(p.date) >= cutoff).length;
}

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

const dailyRuns = new Map<string, Promise<void>>();

export async function generateBlogRun(root: string, options: GenerateRunOptions): Promise<GenerateRunResult> {
  if (options.dailyTarget === undefined || options.dryRun) return generate(root, options);
  // One process can host multiple runtimes. Serialize scheduler overlap per canonical site.
  const site = blogHubUrl();
  const run = (dailyRuns.get(site) ?? Promise.resolve()).then(() => generate(root, options));
  const tail = run.then(() => {}, () => {});
  dailyRuns.set(site, tail);
  try { return await run; }
  finally {
    if (dailyRuns.get(site) === tail) dailyRuns.delete(site);
  }
}

async function generate(root: string, options: GenerateRunOptions): Promise<GenerateRunResult> {
  if (!Number.isSafeInteger(options.count) || options.count < 1) throw new Error('count must be a positive safe integer');
  const logPrefix = BLOG_CONFIG.logPrefix || '[blog-engine]';
  if (process.env.BLOG_ENGINE_DISABLED === '1') {
    console.log(`${logPrefix} BLOG_ENGINE_DISABLED=1 - exiting without generating.`);
    return { written: [], skipped: 'BLOG_ENGINE_DISABLED' };
  }

  const dateISO = (options.now || new Date()).toISOString().slice(0, 10);
  const store = getStore(root);
  const existing = await listExistingPosts(root);
  const dailyTarget = options.dailyTarget;
  let count = options.count;
  if (dailyTarget !== undefined) {
    if (!Number.isSafeInteger(dailyTarget) || dailyTarget < 1) throw new Error('dailyTarget must be a positive safe integer');
    if (store.publicationStatus && store.publicationStatus !== 'published') throw new Error('dailyTarget requires a published corpus');
    count = Math.min(count, dailyTarget - existing.filter((post) => post.date === dateISO && (!post.status || post.status === 'published')).length);
    if (count <= 0) return { written: [], skipped: `daily publication target already met for ${dateISO}` };
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
  if (!options.dryRun && store.root) ensureDir(blogDir);
  console.log(`${logPrefix} existing posts: ${existing.length}`);

  const written: string[] = [];
  const publishedCopy: Array<{ slug: string; title: string; answer: string }> = [];
  let generationError: BlogRunError | undefined;
  try {
    for (let i = 0; i < count; i++) {
      const topic = await resolveTopic(existing, queries, 0, { allowCoveredFallback: !contentRules().requireFreshTopic });
      if (!topic) {
        throw new Error('No uncovered topic ready. Add distinct editorial briefs or configure a topic provider.');
      }
      console.log(`${logPrefix} topic #${existing.length}: ${describeTopic(topic)}`);
      const post = await generateBlogPost(topic, existing);
      const ordinal = existing.length;
      const cover = await generateCoverImage(root, post, topic, ordinal, options.dryRun);
      const gradient = gradientForOrdinal(ordinal);
      // The consuming site may own its own frontmatter shape; the engine still owns everything
      // around it (generation, validation, watermarking, encoding, the write).
      const author = BLOG_CONFIG.identity.author?.name;
      const renderMarkdown = getBlogHooks().renderMarkdown;
      const md = renderMarkdown
        ? renderMarkdown({ post, cover, gradient, dateISO, author })
        : toMarkdown(post, { gradient, cover, dateISO, author });
      const file = join(blogDir, `${post.slug}${contentExtensions()[0]}`);

      assertNoEmDashes({ post, cover, markdown: md });
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
          target = await store.putPost({ post, cover, markdown: md, dateISO, isRefresh: false });
        }
        console.log(`${logPrefix} published ${target} (image: ${cover.source}, og: ${cover.ogImage})`);
        written.push(post.slug);
        publishedCopy.push({ slug: post.slug, title: post.title, answer: post.answer });
      }
      existing.push({ slug: post.slug, title: post.title, date: dateISO });
    }

  } catch (error) { generationError = new BlogRunError('generate', written, error); }

  if (!options.dryRun && !options.skipPing && written.length && (!store.publicationStatus || store.publicationStatus === 'published')) {
    try { await submitBlogDiscovery(written, { posts: publishedCopy, googleToken: token, notify: false }); }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new BlogRunError('generate', written, generationError
        ? new Error(`${generationError.message} | discovery: ${detail}`, { cause: generationError })
        : error);
    }
  }
  if (generationError) throw generationError;
  return { written };
}
