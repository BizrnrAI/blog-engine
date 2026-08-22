import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';
import sharp from 'sharp';
import { auditBlogCorpus } from '../src/audit.js';
import { parseBlogFrontmatter, readGeneratedBlogPosts } from '../src/content-reader.js';
import { corroborates, hasSecondDemandSignal } from '../src/demand.js';
import { generateFanoutPassages, questionLikeQueries, validateFanout } from '../src/fanout.js';
import { normalizeGeneratedPost, validateGeneratedPost } from '../src/generate-post.js';
import { writeHeroVariants } from '../src/images.js';
import { toMarkdown } from '../src/markdown.js';
import { generateBlogRun } from '../src/publisher.js';
import { refreshBlogRun } from '../src/refresh.js';
import { blogPostingSchema } from '../src/schema.js';
import { formatScorecard, runScorecard } from '../src/scorecard.js';
import { hostAllowed, normalizeSources, verifySources } from '../src/sources.js';
import { createAfterIndexedHook, webhookAdapter } from '../src/syndication.js';
import { blogScorecardWorkflow } from '../src/workflows.js';
import type { SeoTopic } from '../src/types.js';
import { configureTestEngine, validPost } from './helpers.js';

const topic: SeoTopic = { type: 'editorial', keyword: 'drain cleaning cost', category: 'Guides', angle: 'pricing', mustBacklink: false };

beforeEach(() => {
  configureTestEngine();
});

// ---- demand ----
test('corroborates needs most distinctive words of the query in a suggestion', () => {
  assert.equal(corroborates('drain cleaning cost springfield', ['drain cleaning cost in springfield il']), true);
  assert.equal(corroborates('drain cleaning cost springfield', ['best pizza springfield']), false);
});

test('hasSecondDemandSignal uses the fetchDemandSignals hook; the demand gate filters GSC topics', async () => {
  configureTestEngine({ content: { requireTwoDemandSignals: true } }, {
    fetchDemandSignals: async (q) => (q.includes('drain') ? ['drain cleaning cost near me'] : []),
    fetchGscQueries: async () => [{ query: 'roof repair cost', impressions: 500 }, { query: 'drain cleaning cost', impressions: 100 }],
    generateText: async ({ messages }) => {
      const p = validPost();
      assert.ok(messages[1].content.includes('drain cleaning cost'), 'only the corroborated GSC topic survives the gate');
      return JSON.stringify(p);
    },
  });
  assert.equal(await hasSecondDemandSignal('drain cleaning cost'), true);
  assert.equal(await hasSecondDemandSignal('roof repair cost'), false);
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-demand-'));
  const result = await generateBlogRun(root, { count: 1, dryRun: true, skipPing: true });
  assert.equal(result.skipped, undefined);
});

// ---- sources ----
test('sources: normalize, allowlist, verify via hook, validator + frontmatter + schema citation', async () => {
  const rt = configureTestEngine({ content: { requireSources: true } }, { verifySource: async (url) => !url.includes('dead') });
  (rt.topics as { trustedSourceDomains?: string[] }).trustedSourceDomains = ['census.gov', 'example.org'];
  const sources = normalizeSources([{ title: 'Census', url: 'https://www.census.gov/x', publisher: 'US Census' }, { title: 'Bad', url: 'not-a-url' }, { title: 'Dead', url: 'https://example.org/dead' }]);
  assert.equal(sources.length, 2);
  assert.equal(hostAllowed('https://www.census.gov/x'), true);
  assert.equal(hostAllowed('https://evil.com/x'), false);
  assert.deepEqual(await verifySources(sources), ['source URL does not resolve: https://example.org/dead']);

  const post = normalizeGeneratedPost({ ...validPost(), sources: [{ title: 'Census', url: 'https://www.census.gov/x' }] });
  assert.ok(validateGeneratedPost(post, { existingSlugs: [], topic }).some((e) => e.includes('need 2-4 verified sources')));
  post.sources!.push({ title: 'Example', url: 'https://example.org/ok', publisher: 'Example Org' });
  assert.deepEqual(validateGeneratedPost(post, { existingSlugs: [], topic }), []);

  const md = toMarkdown(post, { gradient: 'g', cover: { image: '/h.webp', imageAlt: 'a', ogImage: '/o.jpg', source: 'ai-generated', srcset: '/h-640.webp 640w, /h.webp 1536w' }, dateISO: '2026-08-22' });
  const parsed = parseBlogFrontmatter(md);
  assert.equal(parsed.sources.length, 2);
  assert.equal(parsed.sources[1].publisher, 'Example Org');
  assert.equal(parsed.frontmatter.imageSrcset, '/h-640.webp 640w, /h.webp 1536w');
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-src-'));
  mkdirSync(join(root, 'src/content/blog'), { recursive: true });
  writeFileSync(join(root, 'src/content/blog/x.md'), md);
  const [p] = readGeneratedBlogPosts({ root, fallback: { description: 'd', author: 'a', heroImage: '/h', heroImageAltPrefix: 'x' } });
  assert.equal(p.sources?.length, 2);
  assert.equal(p.heroImageSrcset, '/h-640.webp 640w, /h.webp 1536w');
  const node = blogPostingSchema(p);
  assert.equal((node.citation as unknown[]).length, 2);
});

// ---- image variants ----
test('writeHeroVariants writes resized files and returns a srcset', async () => {
  configureTestEngine({ image: { ...configureTestEngine().config.image, variants: [640, 1024, 4000] } });
  const dir = mkdtempSync(join(tmpdir(), 'blog-engine-variants-'));
  const full = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: { r: 10, g: 20, b: 30 } } }).webp().toBuffer();
  const srcset = await writeHeroVariants(dir, 'my-post', 'webp', full, 1536, '/assets/blog/generated/my-post.webp');
  assert.equal(srcset, '/assets/blog/generated/my-post-640.webp 640w, /assets/blog/generated/my-post-1024.webp 1024w, /assets/blog/generated/my-post.webp 1536w');
  assert.ok(existsSync(join(dir, 'my-post-640.webp')) && existsSync(join(dir, 'my-post-1024.webp')));
  assert.ok(!existsSync(join(dir, 'my-post-4000.webp')), 'never upscale');
  assert.equal((await sharp(join(dir, 'my-post-640.webp')).metadata()).width, 640);
});

// ---- refresh backlog fallback ----
test('refresh falls back to the worst-audited FIX post when Search Console has no candidates', async () => {
  configureTestEngine({}, { generateText: async () => JSON.stringify(validPost()) });
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-backlog-'));
  mkdirSync(join(root, 'src/content/blog'), { recursive: true });
  writeFileSync(join(root, 'src/content/blog/drain-cleaning-cost-springfield.md'), '---\ntitle: "Old Thin Post"\ndate: 2025-01-01\nimage: "/assets/blog/generated/x.webp"\nimageAlt: "x"\n---\n' + Array(320).fill('word').join(' '));
  const result = await refreshBlogRun(root, { dryRun: false });
  assert.deepEqual(result.refreshed, ['drain-cleaning-cost-springfield']);
  const md = readFileSync(join(root, 'src/content/blog/drain-cleaning-cost-springfield.md'), 'utf8');
  assert.ok(md.includes('date: 2025-01-01') && md.includes('## What drives the price of drain cleaning?'));
  const after = auditBlogCorpus(root);
  assert.ok(after[0].issues.length < 6, 'refresh reduced audit issues: ' + after[0].issues.join('; '));
  assert.equal((await refreshBlogRun(root, { dryRun: true, backlog: false })).skipped, 'NO_CANDIDATES');
});

// ---- fanout ----
test('fanout: question-like query filter, validation, and generation via hook', async () => {
  assert.deepEqual(questionLikeQueries([{ query: 'how much is drain cleaning', impressions: 5 }, { query: 'drain cleaning', impressions: 50 }, { query: 'can i snake my own drain?', impressions: 9 }]), ['can i snake my own drain?', 'how much is drain cleaning']);
  assert.ok(validateFanout([{ question: 'no question mark', answer: 'short' }], 2).length >= 2);
  configureTestEngine({}, { generateText: async () => JSON.stringify({ passages: [
    { question: 'How much is drain cleaning?', answer: Array(45).fill('w').join(' ') },
    { question: 'Can I snake my own drain?', answer: Array(50).fill('w').join(' ') },
  ] }) });
  const result = await generateFanoutPassages('/services/drain-cleaning', { queries: ['how much is drain cleaning'], count: 2 });
  assert.equal(result.passages.length, 2);
  assert.equal(result.ownerPath, '/services/drain-cleaning');
});

// ---- scorecard ----
test('scorecard: cadence/corpus/feed/citations checks with N/A for unavailable sources; strict summary', async () => {
  configureTestEngine({}, { probeCitations: async () => [{ provider: 'x', probeType: 'grounded', available: true, mentioned: true, citedUrls: [], checkedAt: 'now' }, { provider: 'y', probeType: 'grounded', available: false, mentioned: false, citedUrls: [], checkedAt: 'now' }] });
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-score-'));
  mkdirSync(join(root, 'src/content/blog'), { recursive: true });
  writeFileSync(join(root, 'src/content/blog/a.md'), '---\ntitle: "A"\ndate: 2026-08-20\n---\n' + Array(500).fill('w').join(' '));
  const card = await runScorecard(root, { expectedCadenceDays: 7, citationQueries: ['q'], now: new Date('2026-08-22') });
  const by = Object.fromEntries(card.checks.map((c) => [c.name, c]));
  assert.equal(by.cadence.status, 'pass');
  assert.equal(by.corpus.status, 'warn');
  assert.equal(by.feed.status, 'fail'); // acme-plumbing.example does not resolve
  assert.equal(by['search-console'].status, 'na');
  assert.equal(by.citations.detail, '1/1 available probes mention acme-plumbing.example');
  assert.ok(formatScorecard(card).includes('cadence'));
  assert.ok(blogScorecardWorkflow().includes('SCORECARD_WEBHOOK_URL'));
});

// ---- syndication ----
test('createAfterIndexedHook fans out to adapters with page metadata and survives failures', async () => {
  const seen: string[] = [];
  const good = { name: 'good', publish: async (i: { url: string; title: string }) => { seen.push(`${i.title}|${i.url}`); } };
  const bad = { name: 'bad', publish: async () => { throw new Error('boom'); } };
  const hook = createAfterIndexedHook([good, bad], { loadPosts: () => [{ slug: 'x', title: 'Title X', description: 'D', category: 'c', tags: [], author: '', publishedAt: '2026-08-22', updatedAt: '2026-08-22', heroImage: '', heroImageAlt: '', answer: '', content: '', faqs: [], body: [] }] });
  await hook({ urls: ['https://acme-plumbing.example/blog/x'], slugs: ['x'] });
  assert.deepEqual(seen, ['Title X|https://acme-plumbing.example/blog/x']);
  await assert.rejects(webhookAdapter({ urlEnv: 'DEFINITELY_UNSET_ENV' }).publish({ url: 'u', slug: 's', title: 't', description: 'd' }), /missing env/);
});

test('0.5.1: pubDate/updatedDate/heroImage aliases are read; refresh fills missing hero dimensions from disk', async () => {
  const { readExistingPosts } = await import('../src/existing-posts.js');
  configureTestEngine({}, { generateText: async () => JSON.stringify(validPost()) });
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-alias-'));
  mkdirSync(join(root, 'src/content/blog'), { recursive: true });
  mkdirSync(join(root, 'public/assets/blog/generated'), { recursive: true });
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 1, g: 2, b: 3 } } }).webp().toFile(join(root, 'public/assets/blog/generated/drain-cleaning-cost-springfield.webp'));
  writeFileSync(join(root, 'src/content/blog/drain-cleaning-cost-springfield.md'), '---\ntitle: "Old"\npubDate: 2025-02-02\nupdatedDate: 2025-03-03\nheroImage: "/assets/blog/generated/drain-cleaning-cost-springfield.webp"\nheroAlt: "old alt"\n---\n' + Array(320).fill('w').join(' '));
  assert.equal(readExistingPosts(root)[0].date, '2025-02-02');
  const [p] = readGeneratedBlogPosts({ root, fallback: { description: 'd', author: 'a', heroImage: '', heroImageAltPrefix: 'x' } });
  assert.equal(p.publishedAt, '2025-02-02'); assert.equal(p.updatedAt, '2025-03-03'); assert.equal(p.heroImageAlt, 'old alt');
  // refresh through the engine's own frontmatter (image:) shape
  writeFileSync(join(root, 'src/content/blog/drain-cleaning-cost-springfield.md'), '---\ntitle: "Old"\ndate: 2025-02-02\nimage: "/assets/blog/generated/drain-cleaning-cost-springfield.webp"\nimageAlt: "old alt"\n---\n' + Array(320).fill('w').join(' '));
  await refreshBlogRun(root, { slugs: ['drain-cleaning-cost-springfield'], dryRun: false });
  const md = readFileSync(join(root, 'src/content/blog/drain-cleaning-cost-springfield.md'), 'utf8');
  assert.ok(md.includes('imageWidth: 1200') && md.includes('imageHeight: 800'), md.split('\n').slice(0, 20).join('\n'));
});
