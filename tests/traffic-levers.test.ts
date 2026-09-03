import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';
import { auditBlogCorpus, formatAuditReport } from '../src/audit.js';
import { relatedPosts } from '../src/discovery.js';
import { relatedLinkTargets, validateGeneratedPost } from '../src/generate-post.js';
import { classifyAction, positionMultiplier, rankRescueCandidates, slugFromPage } from '../src/rank-rescue.js';
import { refreshBlogRun } from '../src/refresh.js';
import { authorProfileSchema, blogPostingSchema, blogSchema } from '../src/schema.js';
import { toMarkdown } from '../src/markdown.js';
import { blogRefreshWorkflow } from '../src/workflows.js';
import type { GscPageQuery, ParsedBlogPost, SeoTopic } from '../src/types.js';
import { configureTestEngine, validPost } from './helpers.js';

const topic: SeoTopic = { type: 'editorial', keyword: 'drain cleaning cost', category: 'Guides', angle: 'pricing', mustBacklink: false };

beforeEach(() => {
  configureTestEngine();
});

// ---------- rank rescue ----------
test('positionMultiplier and classifyAction follow the skill table', () => {
  assert.equal(positionMultiplier(12, 0.05), 2);
  assert.equal(classifyAction(12, 0.05), 'refresh');
  assert.equal(positionMultiplier(45, 0.02), 1);
  assert.equal(classifyAction(45, 0.02), 'authority');
  assert.equal(positionMultiplier(70, 0), 0.5);
  assert.equal(classifyAction(70, 0), 'audit');
  assert.equal(positionMultiplier(3, 0.005), 1.5);
  assert.equal(classifyAction(3, 0.005), 'title-experiment');
  assert.equal(positionMultiplier(3, 0.2), 1);
});

test('rankRescueCandidates aggregates per page, applies eligibility, zero-click boost, and sorts by score', () => {
  const rows: GscPageQuery[] = [
    { page: 'https://acme-plumbing.example/blog/a', query: 'drain cost', impressions: 100, clicks: 0, position: 12 },
    { page: 'https://acme-plumbing.example/blog/a', query: 'drain price', impressions: 50, clicks: 0, position: 15 },
    { page: 'https://acme-plumbing.example/blog/b', query: 'pipe', impressions: 200, clicks: 40, position: 2 },
    { page: 'https://acme-plumbing.example/blog/c', query: 'x y', impressions: 10, clicks: 0, position: 20 }, // under 25 impressions
    { page: 'https://acme-plumbing.example/services/x', query: 'svc', impressions: 500, clicks: 5, position: 9 }, // not a post
  ];
  const c = rankRescueCandidates(rows);
  assert.deepEqual(c.map((x) => x.slug), ['a', 'b']);
  assert.equal(c[0].action, 'refresh');
  assert.equal(c[0].score, Math.round(150 * 2 * 1.5)); // impressions × pos(8–30) × zero-click
  assert.equal(c[0].position, 13);
  assert.equal(c[0].queries[0].query, 'drain cost');
  assert.equal(c[1].action, 'title-experiment' === classifyAction(2, 0.2) ? 'title-experiment' : c[1].action);
  assert.equal(slugFromPage('https://x.example/blog/my-post/'), 'my-post');
  assert.equal(slugFromPage('https://x.example/about'), null);
});

// ---------- refresh mode ----------
function rootWithPost(): string {
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-refresh-'));
  mkdirSync(join(root, 'src/content/blog'), { recursive: true });
  const md = toMarkdown(validPost(), {
    gradient: 'g2',
    cover: { image: '/assets/blog/generated/drain-cleaning-cost-springfield.webp', imageAlt: 'Acme Plumbing – plumber at a sink', ogImage: '/assets/blog/drain-cleaning-cost-springfield.jpg', source: 'ai-generated', width: 1536, height: 1024 },
    dateISO: '2026-05-01',
    author: 'Alex Acme',
  });
  writeFileSync(join(root, 'src/content/blog/drain-cleaning-cost-springfield.md'), md);
  return root;
}

test('refreshBlogRun regenerates the body, keeps slug/date/hero, bumps updated, and uses GSC candidates', async () => {
  const seen: string[] = [];
  configureTestEngine({}, {
    generateText: async ({ messages }) => {
      seen.push(messages.map((m) => m.content).join('\n'));
      const p = validPost();
      p.title = 'Drain Cleaning Cost in Springfield: What You Pay and Why';
      p.slug = 'will-be-overridden';
      return JSON.stringify(p);
    },
    fetchGscPageQueries: async () => [
      { page: 'https://acme-plumbing.example/blog/drain-cleaning-cost-springfield', query: 'drain cleaning price springfield', impressions: 120, clicks: 2, position: 11 },
    ],
  });
  const root = rootWithPost();
  const result = await refreshBlogRun(root, { dryRun: false });
  assert.deepEqual(result.refreshed, ['drain-cleaning-cost-springfield']);
  assert.equal(result.candidates[0].action, 'refresh');
  assert.ok(seen[0].includes('drain cleaning price springfield'), 'real queries are fed to the model');
  const md = readFileSync(join(root, 'src/content/blog/drain-cleaning-cost-springfield.md'), 'utf8');
  assert.ok(md.includes('date: 2026-05-01'), 'publish date preserved');
  assert.ok(md.includes(`updated: ${new Date().toISOString().slice(0, 10)}`), 'updated bumped to today');
  assert.ok(md.includes('image: "/assets/blog/generated/drain-cleaning-cost-springfield.webp"'), 'hero preserved');
  assert.ok(md.includes('imageWidth: 1536'), 'dims preserved');
  assert.ok(md.includes('author: "Alex Acme"'), 'author preserved');
  assert.ok(md.includes('title: "Drain Cleaning Cost in Springfield: What You Pay and Why"'));
});

test('refreshBlogRun skips cleanly with no candidates and no slugs', async () => {
  configureTestEngine({}, { generateText: async () => { throw new Error('no'); } });
  const result = await refreshBlogRun(rootWithPost(), { dryRun: true });
  assert.equal(result.skipped, 'NO_CANDIDATES');
});

// ---------- internal link graph ----------
test('validator accepts links to existing posts and relatedLinkTargets lists them', () => {
  const post = validPost();
  post.body += '\nRelated: [winter pipe care](/blog/winter-pipe-care).';
  const errs = validateGeneratedPost(post, { existingSlugs: ['winter-pipe-care'], topic });
  assert.deepEqual(errs.filter((e) => e.includes('non-existent')), []);
  const errs2 = validateGeneratedPost(post, { existingSlugs: [], topic });
  assert.ok(errs2.some((e) => e.includes('non-existent')));
  assert.deepEqual(relatedLinkTargets([{ slug: 'a', title: 'A' }, { slug: 'b', title: '' }]), [{ title: 'A', path: '/blog/a' }]);
});

const p = (slug: string, tags: string[], category = 'Guides', updatedAt = '2026-08-01'): ParsedBlogPost => ({
  slug, title: slug, description: 'd', category, tags, author: '', publishedAt: updatedAt, updatedAt, heroImage: '', heroImageAlt: '', answer: '', content: '', faqs: [], body: [],
});

test('relatedPosts ranks by tag overlap then category then recency', () => {
  const me = p('me', ['drains', 'pricing']);
  const pool = [me, p('x', ['drains', 'pricing'], 'Local', '2026-01-01'), p('y', ['drains'], 'Guides', '2026-08-10'), p('z', ['roofing'], 'Other'), p('w', ['pricing'], 'Guides', '2026-07-01')];
  assert.deepEqual(relatedPosts(me, pool).map((r) => r.slug), ['x', 'y', 'w']);
});

// ---------- corpus audit ----------
test('auditBlogCorpus returns SHIP for a contract-complete post and FIX/BLOCK with reasons otherwise', () => {
  configureTestEngine({ content: { blockedPhrases: ['guaranteed savings'] } });
  const root = rootWithPost();
  writeFileSync(join(root, 'src/content/blog/thin.md'), '---\ntitle: "Thin"\ndate: 2024-01-01\n---\nShort body with guaranteed savings.');
  const entries = auditBlogCorpus(root, { now: new Date('2026-08-22') });
  const good = entries.find((e) => e.slug === 'drain-cleaning-cost-springfield')!;
  const thin = entries.find((e) => e.slug === 'thin')!;
  assert.equal(good.verdict, 'SHIP', good.issues.join('; '));
  assert.equal(thin.verdict, 'BLOCK');
  assert.ok(thin.issues.some((i) => i.includes('blocked claim')));
  assert.ok(thin.issues.some((i) => i.includes('under 300 words')));
  assert.ok(thin.issues.some((i) => i.includes('stale')));
  assert.ok(formatAuditReport(entries).includes('BLOCK  thin'));
});

// ---------- schema completeness ----------
test('schema: inLanguage/wordCount/isPartOf on posts; Blog + ProfilePage builders', () => {
  const post = p('x', ['a']);
  post.content = 'one two three';
  const node = blogPostingSchema(post);
  assert.equal(node.inLanguage, 'en-US');
  assert.equal(node.wordCount, 3);
  assert.deepEqual(node.isPartOf, { '@id': 'https://acme-plumbing.example/blog#blog' });
  const blog = blogSchema({ name: 'Acme Insights' });
  assert.equal(blog['@id'], 'https://acme-plumbing.example/blog#blog');
  const profile = authorProfileSchema({ path: '/about', id: 'https://acme-plumbing.example/#person', name: 'Alex Acme', sameAs: ['https://linkedin.com/in/alex'] });
  const types = (profile['@graph'] as Array<Record<string, unknown>>).map((n) => n['@type']);
  assert.deepEqual(types, ['ProfilePage', 'Person']);
});

// ---------- workflows ----------
test('blogRefreshWorkflow emits a scheduled PR-safe refresh job', () => {
  const y = blogRefreshWorkflow({ refreshCron: '0 14 * * 2' });
  assert.ok(y.includes('schedule:') && !y.includes('create-pull-request') && y.includes('blog:refresh'));
});

test('refresh prompt carries owner pages and existing-post link targets (parity with generate)', async () => {
  let prompt = '';
  const rt = configureTestEngine({}, { generateText: async ({ messages }) => { prompt = messages.map((m) => m.content).join('\n'); return JSON.stringify(validPost()); } });
  (rt.topics as { ownerPages?: string[] }).ownerPages = ['/services/drain-cleaning'];
  const root = rootWithPost();
  writeFileSync(join(root, 'src/content/blog/winter-pipe-care.md'), '---\ntitle: "Winter Pipe Care"\ndate: 2026-01-01\n---\nBody');
  await refreshBlogRun(root, { slugs: ['drain-cleaning-cost-springfield'], dryRun: true });
  assert.ok(prompt.includes('canonical OWNERS') && prompt.includes('/services/drain-cleaning'));
  assert.ok(prompt.includes('/blog/winter-pipe-care'));
});
