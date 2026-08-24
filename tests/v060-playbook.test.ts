import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';
import { auditBlogCorpus, blockedSlugs } from '../src/audit.js';
import { blogHubSitemapEntry, blogSitemapEntries, buildBlogLlmsTxt, excludeBlocked, relatedPosts } from '../src/discovery.js';
import { validateGeneratedPost } from '../src/generate-post.js';
import { buildBlogRss } from '../src/rss.js';
import { cannibalizationPairs, classifyAction, classifyQueryIntent } from '../src/rank-rescue.js';
import { refreshBlogRun } from '../src/refresh.js';
import { crawlerBlocked, RETRIEVAL_CRAWLERS } from '../src/scorecard.js';
import { pickTopic } from '../src/topic-rotation.js';
import { toMarkdown } from '../src/markdown.js';
import type { GscPageQuery, ParsedBlogPost, SeoTopic } from '../src/types.js';
import { configureTestEngine, validPost } from './helpers.js';

const topic: SeoTopic = { type: 'editorial', keyword: 'k', category: 'Guides', angle: 'a', mustBacklink: false };

const post = (slug: string, over: Partial<ParsedBlogPost> = {}): ParsedBlogPost => ({
  slug, title: slug, description: 'd', category: 'Guides', tags: ['t'], author: 'A',
  publishedAt: '2026-08-01', updatedAt: '2026-08-01', heroImage: '/h.webp', heroImageAlt: 'alt',
  answer: 'A direct answer.', content: '', faqs: [], body: [], ...over,
});

beforeEach(() => {
  configureTestEngine();
});

// ---- rank rescue: leave-alone + cannibalization + intent ----
test('classifyAction leaves a healthy top-of-page result alone', () => {
  assert.equal(classifyAction(3, 0.2), 'leave-alone', 'position 3 with 20% CTR is working');
  assert.equal(classifyAction(3, 0.004), 'title-experiment', 'position 3 with poor CTR is a packaging problem');
  assert.equal(classifyAction(12, 0.05), 'refresh');
  assert.equal(classifyAction(45, 0.01), 'authority');
  assert.equal(classifyAction(80, 0), 'audit');
});

test('cannibalizationPairs finds one query split across two of our own URLs', () => {
  const rows: GscPageQuery[] = [
    { page: 'https://x/blog/a', query: 'Drain Cleaning Cost', impressions: 40, clicks: 1, position: 12 },
    { page: 'https://x/blog/b', query: 'drain cleaning cost', impressions: 25, clicks: 0, position: 18 },
    { page: 'https://x/blog/c', query: 'drain cleaning cost', impressions: 4, clicks: 0, position: 40 },
    { page: 'https://x/blog/a', query: 'unique query', impressions: 90, clicks: 3, position: 5 },
  ];
  const pairs = cannibalizationPairs(rows);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].query, 'drain cleaning cost');
  assert.equal(pairs[0].pages.length, 2, 'the 4-impression page is below the threshold');
  assert.equal(pairs[0].pages[0].impressions, 40);
  assert.deepEqual(cannibalizationPairs(rows, 100), []);
});

test('query intent heuristic separates verification from commercial', () => {
  assert.equal(classifyQueryIntent('is acme plumbing legit'), 'verification');
  assert.equal(classifyQueryIntent('acme plumbing vs bob plumbing'), 'verification');
  assert.equal(classifyQueryIntent('how do i unclog a drain?'), 'verification');
  assert.equal(classifyQueryIntent('best plumber near me'), 'commercial');
  assert.equal(classifyQueryIntent('drain maintenance schedule'), 'informational');
  const rt = configureTestEngine();
  (rt.topics as { intentForQuery?: (q: string) => 'commercial' }).intentForQuery = () => 'commercial';
  assert.equal(classifyQueryIntent('is acme legit'), 'commercial', 'site override wins');
});

test('preferVerificationIntent reorders GSC topic candidates; default order is unchanged', () => {
  const rt = configureTestEngine();
  const queries = [{ query: 'best plumber near me', impressions: 900 }, { query: 'is hydro jetting safe', impressions: 20 }];
  assert.equal(pickTopic([], queries, 0).keyword, 'best plumber near me', 'default: impressions order');
  (rt.topics as { preferVerificationIntent?: boolean }).preferVerificationIntent = true;
  assert.equal(pickTopic([], queries, 0).keyword, 'is hydro jetting safe');
});

// ---- refresh cooldown ----
test('refresh holds a post that was refreshed inside the evidence window', async () => {
  configureTestEngine({}, { generateText: async () => JSON.stringify(validPost()) });
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-cool-'));
  mkdirSync(join(root, 'src/content/blog'), { recursive: true });
  const recent = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
  // Thin post → audit FIX → backlog would pick it, but it was just refreshed.
  writeFileSync(join(root, 'src/content/blog/recent.md'), `---\ntitle: "Recent"\ndate: 2026-01-01\nupdated: ${recent}\n---\n` + Array(320).fill('w').join(' '));
  const held = await refreshBlogRun(root, { dryRun: true });
  assert.equal(held.skipped, 'NO_CANDIDATES', 'cooldown held the only candidate');

  const old = new Date(Date.now() - 100 * 864e5).toISOString().slice(0, 10);
  writeFileSync(join(root, 'src/content/blog/recent.md'), `---\ntitle: "Recent"\ndate: 2026-01-01\nupdated: ${old}\n---\n` + Array(320).fill('w').join(' '));
  const ran = await refreshBlogRun(root, { dryRun: true });
  assert.equal(ran.skipped, undefined, 'past the window it is eligible again');

  // An explicit slug always overrides the cooldown.
  writeFileSync(join(root, 'src/content/blog/recent.md'), `---\ntitle: "Recent"\ndate: 2026-01-01\nupdated: ${recent}\n---\n` + Array(320).fill('w').join(' '));
  const forced = await refreshBlogRun(root, { slugs: ['recent'], dryRun: true });
  assert.equal(forced.skipped, undefined);
});

// ---- discovery: hub lastmod + one publishable predicate ----
test('blogHubSitemapEntry carries the newest post date so the hub gets refetched', () => {
  const entry = blogHubSitemapEntry([post('a', { updatedAt: '2026-08-01' }), post('b', { updatedAt: '2026-08-19' })]);
  assert.deepEqual(entry, { loc: 'https://acme-plumbing.example/blog', lastmod: '2026-08-19' });
});

test('one exclude list keeps sitemap, feed, llms.txt and related posts in agreement', () => {
  const posts = [post('good'), post('blocked'), post('other')];
  const exclude = ['blocked'];
  assert.deepEqual(excludeBlocked(posts, exclude).map((p) => p.slug), ['good', 'other']);
  assert.deepEqual(blogSitemapEntries(posts, { exclude }).map((e) => e.loc.split('/').pop()), ['good', 'other']);
  assert.ok(!buildBlogLlmsTxt(posts, { exclude }).includes('/blog/blocked'));
  assert.deepEqual(relatedPosts(post('good'), posts, 3, exclude).map((p) => p.slug), ['other']);
  const xml = buildBlogRss(posts.map((p) => ({ id: p.slug, title: p.title, description: p.description, date: new Date('2026-08-01') })), { exclude });
  assert.ok(!xml.includes('/blog/blocked') && xml.includes('/blog/good'));
});

test('blockedSlugs feeds the exclude list straight from the audit', () => {
  configureTestEngine({ content: { blockedPhrases: ['guaranteed savings'] } });
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-blocked-'));
  mkdirSync(join(root, 'src/content/blog'), { recursive: true });
  writeFileSync(join(root, 'src/content/blog/bad.md'), '---\ntitle: "Bad"\ndate: 2026-08-01\n---\nWe promise guaranteed savings.');
  assert.deepEqual(blockedSlugs(auditBlogCorpus(root)), ['bad']);
});

// ---- audit: orphan detection ----
test('audit flags an orphan once there is a link graph, and clears it when linked', () => {
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-orphan-'));
  mkdirSync(join(root, 'src/content/blog'), { recursive: true });
  const body = (extra = '') => Array(500).fill('word').join(' ') + extra;
  writeFileSync(join(root, 'src/content/blog/hub.md'), '---\ntitle: "Hub"\ndate: 2026-08-01\n---\n' + body(' See [one](/blog/one).'));
  writeFileSync(join(root, 'src/content/blog/one.md'), '---\ntitle: "One"\ndate: 2026-08-01\n---\n' + body());
  writeFileSync(join(root, 'src/content/blog/lonely.md'), '---\ntitle: "Lonely"\ndate: 2026-08-01\n---\n' + body());
  const entries = auditBlogCorpus(root, { now: new Date('2026-08-22') });
  const orphaned = (slug: string) => entries.find((e) => e.slug === slug)!.issues.some((i) => i.startsWith('orphan'));
  assert.equal(orphaned('one'), false, 'hub links to it');
  assert.equal(orphaned('lonely'), true);
  assert.equal(orphaned('hub'), true, 'nothing links to the hub post either');
});

// ---- content contract tightening ----
test('the citable blockquote floor now matches the 134-167 word guidance', () => {
  const p = validPost();
  const base = p.body.split('\n').filter((l) => !l.startsWith('> ')).join('\n');
  p.body = base + '\n\n> ' + Array(70).fill('w').join(' ') + ' as of August 2026.';
  assert.ok(validateGeneratedPost(p, { existingSlugs: [], topic }).some((e) => e.includes('134-167')), 'a 70-word passage is too thin to cite');
  p.body = base + '\n\n> ' + Array(150).fill('w').join(' ') + ' as of August 2026.';
  assert.deepEqual(validateGeneratedPost(p, { existingSlugs: [], topic }).filter((e) => e.includes('blockquote')), []);
});

// ---- robots parsing for retrieval crawlers ----
test('crawlerBlocked reads per-agent robots rules', () => {
  const robots = ['User-agent: *', 'Allow: /', '', 'User-agent: PerplexityBot', 'Disallow: /', '', 'User-agent: OAI-SearchBot', 'Disallow: /admin'].join('\n');
  assert.equal(crawlerBlocked(robots, 'PerplexityBot', '/blog/'), true);
  assert.equal(crawlerBlocked(robots, 'OAI-SearchBot', '/blog/'), false, 'only /admin is blocked');
  assert.equal(crawlerBlocked(robots, 'OAI-SearchBot', '/admin/x'), true);
  assert.equal(crawlerBlocked(robots, 'Claude-SearchBot', '/blog/'), false, 'unnamed agent falls through to allowed');
  assert.equal(crawlerBlocked('', 'PerplexityBot', '/blog/'), false);
  assert.ok(RETRIEVAL_CRAWLERS.includes('Claude-SearchBot'));
});

// ---- frontmatter still round-trips ----
test('sitemap priority field is optional and absent by default', () => {
  const md = toMarkdown(validPost(), { gradient: 'g', cover: { image: '/i.webp', imageAlt: 'a', ogImage: '/o.jpg', source: 'ai-generated' }, dateISO: '2026-08-24' });
  assert.ok(md.includes('date: 2026-08-24'));
  assert.equal(blogSitemapEntries([post('a')])[0].priority, undefined);
});
