import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';
import { parseBlogFrontmatter, readGeneratedBlogPosts } from '../src/content-reader.js';
import { blogHubSitemapEntry, blogSitemapEntries, buildBlogLlmsTxt } from '../src/discovery.js';
import { readExistingPosts } from '../src/existing-posts.js';
import { validateGeneratedPost } from '../src/generate-post.js';
import { toMarkdown } from '../src/markdown.js';
import { countPostsSince, generateBlogRun } from '../src/publisher.js';
import { blogPostingSchema } from '../src/schema.js';
import type { ParsedBlogPost, SeoTopic } from '../src/types.js';
import { configureTestEngine, validPost } from './helpers.js';

const topic: SeoTopic = { type: 'editorial', keyword: 'drain cleaning cost', category: 'Guides', angle: 'pricing', mustBacklink: false };

function tempRootWithPosts(dates: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-cadence-'));
  const dir = join(root, 'src/content/blog');
  mkdirSync(dir, { recursive: true });
  dates.forEach((date, i) => writeFileSync(join(dir, `post-${i}.md`), `---\ntitle: "Post ${i}"\ndate: ${date}\n---\nBody`));
  return root;
}

function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
}

beforeEach(() => {
  configureTestEngine();
});

test('readExistingPosts captures the publish date', () => {
  const root = tempRootWithPosts(['2026-08-01']);
  const posts = readExistingPosts(root);
  assert.equal(posts[0].date, '2026-08-01');
});

test('countPostsSince counts only posts inside the window', () => {
  const existing = [{ date: iso(1) }, { date: iso(3) }, { date: iso(12) }, { slug: 'undated' } as { date?: string }];
  assert.equal(countPostsSince(existing, 7), 2);
});

test('the website owns volume: engine generates even with multiple recent posts', async () => {
  configureTestEngine({}, { generateText: async () => JSON.stringify(validPost()) });
  const root = tempRootWithPosts([iso(1), iso(2), iso(3), iso(4)]);
  const result = await generateBlogRun(root, { count: 1, dryRun: true, skipPing: true });
  assert.equal(result.skipped, undefined);
});

test('cadence guard is inert when unset (existing behaviour)', async () => {
  configureTestEngine({}, { generateText: async () => JSON.stringify(validPost()) });
  const root = tempRootWithPosts([iso(1)]);
  const result = await generateBlogRun(root, { count: 1, dryRun: true, skipPing: true });
  assert.equal(result.skipped, undefined);
});

test('author and hero dimensions round-trip through frontmatter', () => {
  const md = toMarkdown(validPost(), {
    gradient: 'g1',
    cover: { image: '/assets/blog/generated/x.webp', imageAlt: 'Acme – scene', ogImage: '/assets/blog/x.jpg', source: 'ai-generated', width: 1536, height: 1024 },
    dateISO: '2026-08-22',
    author: 'Alex Acme',
  });
  const { frontmatter } = parseBlogFrontmatter(md);
  assert.equal(frontmatter.author, 'Alex Acme');
  assert.equal(frontmatter.imageWidth, '1536');
  assert.equal(frontmatter.imageHeight, '1024');

  const root = mkdtempSync(join(tmpdir(), 'blog-engine-reader-'));
  mkdirSync(join(root, 'src/content/blog'), { recursive: true });
  writeFileSync(join(root, 'src/content/blog/x.md'), md);
  const [parsed] = readGeneratedBlogPosts({ root, fallback: { description: 'd', author: 'Fallback', heroImage: '/h.jpg', heroImageAltPrefix: 'Acme' } });
  assert.equal(parsed.author, 'Alex Acme');
  assert.equal(parsed.heroImageWidth, 1536);
  assert.equal(parsed.heroImageHeight, 1024);
});

const parsedPost: ParsedBlogPost = {
  slug: 'x', title: 'X?', description: 'D', category: 'Guides', tags: ['a'], author: 'Alex Acme',
  publishedAt: '2026-08-20', updatedAt: '2026-08-22', heroImage: '/h.webp', heroImageAlt: 'alt',
  heroImageWidth: 1536, heroImageHeight: 1024, ogImage: '/og.jpg', answer: 'A', content: '', faqs: [], body: [],
};

test('schema: configured identity.author is the default BlogPosting author', () => {
  configureTestEngine({ identity: { ...configureTestEngine().config.identity, author: { name: 'Alex Acme', id: 'https://acme-plumbing.example/#person' } } });
  const node = blogPostingSchema(parsedPost);
  assert.deepEqual(node.author, { '@id': 'https://acme-plumbing.example/#person' });
});

test('schema: hero with dimensions becomes an ImageObject; speakable emitted only when asked', () => {
  const node = blogPostingSchema(parsedPost, { speakableSelectors: ['.speakable-answer'] });
  const images = node.image as unknown[];
  assert.equal(images[0], 'https://acme-plumbing.example/og.jpg');
  assert.deepEqual(images[1], { '@type': 'ImageObject', url: 'https://acme-plumbing.example/h.webp', width: 1536, height: 1024 });
  assert.deepEqual(node.speakable, { '@type': 'SpeakableSpecification', cssSelector: ['.speakable-answer'] });
  assert.equal(blogPostingSchema(parsedPost).speakable, undefined);
});

test('discovery: sitemap entries use updatedAt as lastmod', () => {
  assert.deepEqual(blogSitemapEntries([parsedPost]), [{ loc: 'https://acme-plumbing.example/blog/x', lastmod: '2026-08-22' }]);
  const runtime = configureTestEngine();
  runtime.config.paths.trailingSlash = true;
  assert.deepEqual(blogSitemapEntries([parsedPost]), [{ loc: 'https://acme-plumbing.example/blog/x/', lastmod: '2026-08-22' }]);
  assert.equal(blogHubSitemapEntry([parsedPost]).loc, 'https://acme-plumbing.example/blog/');
});

test('discovery: llms.txt section lists the feed and posts with their meta descriptions', () => {
  const txt = buildBlogLlmsTxt([parsedPost]);
  assert.ok(txt.startsWith('## Blog'));
  assert.ok(txt.includes('- RSS feed: https://acme-plumbing.example/blog/feed.xml'));
  assert.ok(txt.includes('- [X?](https://acme-plumbing.example/blog/x): D'));
  const runtime = configureTestEngine();
  runtime.config.paths.trailingSlash = true;
  assert.ok(buildBlogLlmsTxt([parsedPost]).includes('- [X?](https://acme-plumbing.example/blog/x/): D'));
});

test('validator: citable blockquote accepts up to 220 words and rejects longer', () => {
  const post = validPost();
  const base = post.body.split('\n').filter((l) => !l.startsWith('> ')).join('\n');
  post.body = base + '\n\n> ' + Array(210).fill('w').join(' ') + ' as of August 2026.';
  assert.deepEqual(validateGeneratedPost(post, { existingSlugs: [], topic }).filter((e) => e.includes('blockquote')), []);
  post.body = base + '\n\n> ' + Array(230).fill('w').join(' ');
  assert.ok(validateGeneratedPost(post, { existingSlugs: [], topic }).some((e) => e.includes('too long')));
});
