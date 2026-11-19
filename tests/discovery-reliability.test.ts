import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blogPostUrl } from '../src/config.js';
import { blogHubSitemapEntry, blogSitemapEntries } from '../src/discovery.js';
import { submitBlogDiscovery } from '../src/indexing.js';
import { liveBlogPageProblems } from '../src/live-page.js';
import { generateBlogRun } from '../src/publisher.js';
import { refreshBlogRun } from '../src/refresh.js';
import { buildBlogRss } from '../src/rss.js';
import { runScorecard } from '../src/scorecard.js';
import { checkSitemapMembership } from '../src/sitemap-health.js';
import { storedRowToPost } from '../src/stored-row.js';
import { blogGenerateWorkflow } from '../src/workflows.js';
import type { BlogStore, GeneratedBlogPost, ParsedBlogPost } from '../src/types.js';
import { configureTestEngine, testConfig, validPost } from './helpers.js';

const today = new Date('2026-11-19T12:00:00Z');
const post = validPost();

function stored(date: string, content: GeneratedBlogPost = post): ParsedBlogPost {
  return storedRowToPost({
    ...content, content: content.body, published_at: date, updated_at: date,
    status: 'published', hero_image: '/hero.jpg', hero_image_alt: 'A plumber at work',
  });
}

function memory(posts: ParsedBlogPost[] = []): BlogStore {
  return {
    name: 'memory', publicationStatus: 'published',
    listPosts: async () => [...posts],
    putPost: async ({ post: copy, dateISO }) => {
      posts.push(stored(dateISO, copy));
      return copy.slug;
    },
  };
}

function html(url: string, title = 'Real article', body = '<p>The answer &amp; its important details appear in the article.</p>') {
  return new Response(`<!doctype html><html><head><link href="${url}" rel="canonical"></head><body><h1>${title}</h1>${body}</body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

test('same-day retries and overlap count published posts only and skip paid work when the target is met', async () => {
  const store = memory([{ ...stored('2026-11-19'), slug: 'draft-slug', status: 'draft' }]);
  let calls = 0;
  const image = testConfig().image;
  configureTestEngine({ image: { ...image, og: { ...image.og, enabled: false } } }, {
    store,
    fetchGscQueries: async () => [],
    generateText: async () => {
      calls++;
      return JSON.stringify({ ...post, title: 'A distinct article for the next reader' });
    },
  });
  const options = { count: 1, dailyTarget: 1, now: today, dryRun: false, skipPing: true };
  const runs = await Promise.all([
    generateBlogRun('/unused', options),
    generateBlogRun('/unused', options),
  ]);
  assert.deepEqual(runs[0].written, [post.slug]);
  assert.match(runs[1].skipped!, /daily publication target already met/);
  assert.equal(calls, 1);
  assert.match(blogGenerateWorkflow({ generateCron: '23 15 * * *', dailyTarget: 1 }), /BLOG_DAILY_TARGET: "1"/);
});

test('daily generation surfaces an exhausted topic calendar before invoking the model', async () => {
  configureTestEngine({ content: { requireFreshTopic: true } }, {
    store: memory([stored('2026-11-17', { ...post, slug: 'winter-pipe-care', title: 'Winter Pipe Care' })]),
    fetchGscQueries: async () => [],
    generateText: async () => assert.fail('exhausted topics must never start generation'),
  });
  await assert.rejects(generateBlogRun('/unused', { count: 1, dailyTarget: 1, now: today, dryRun: false, skipPing: true }), /No uncovered topic ready/);
});

test('canonical page checks detect conflicting tags, noindex, and content hidden in script', async () => {
  configureTestEngine();
  const url = blogPostUrl('real');
  const settings = { requireCanonicalHtml: true, title: 'Real article', answer: 'The answer and its important details appear in the article.' };
  const ok = html(url, 'Real <span>article</span>', '<p>The answer and its important <strong>details</strong> appear in the article.</p>');
  assert.deepEqual(liveBlogPageProblems(url, ok, await ok.text(), settings), []);
  const page = html(url, 'Unrelated page', '<script>The answer and its important details appear in the article.</script>');
  page.headers.set('x-robots-tag', 'otherbot: noindex, Googlebot: noindex');
  page.headers.set('link', '<https://example.com/>; rel="canonical"');
  assert.deepEqual(liveBlogPageProblems(url, page, await page.text(), settings), [
    'X-Robots-Tag prevents indexing', 'HTTP canonical points away from the article URL',
    'article title missing from rendered H1', 'published answer missing from readable HTML',
  ]);
  const soft = new Response('<head><meta content="noindex, follow" name="robots"></head><h1>Real article</h1>', { headers: { 'content-type': 'text/html' } });
  assert.ok(liveBlogPageProblems(url, soft, await soft.text(), settings).includes('robots meta tag prevents indexing'));
});

test('discovery checks each page once, submits only ready URLs, and attempts Google after an IndexNow failure', async (t) => {
  const sitemapCalls: string[] = [];
  configureTestEngine({ indexing: { requireCanonicalHtml: true } }, {
    submitSitemap: async ({ sitemap }) => { sitemapCalls.push(sitemap); },
    afterIndexed: async () => assert.fail('partial submission cannot trigger syndication'),
  });
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string, init: RequestInit) => {
    calls.push(input);
    if (input.includes('api.indexnow.org')) {
      assert.deepEqual(JSON.parse(String(init.body)).urlList, [blogPostUrl('ready')]);
      return new Response('', { status: 503 });
    }
    return input.endsWith('/ready') ? html(input) : html(blogPostUrl('ready'));
  });
  await assert.rejects(submitBlogDiscovery(['ready', 'wrong'], { timeoutMs: 0 }), /wrong.*canonical.*IndexNow.*503/);
  assert.deepEqual(calls, [blogPostUrl('ready'), blogPostUrl('wrong'), 'https://api.indexnow.org/indexnow']);
  assert.equal(sitemapCalls.length, 1);
});

test('discovery reports provider receipts without equating pending key validation with indexing', async (t) => {
  configureTestEngine({}, {
    submitSitemap: async () => {},
  });
  t.mock.method(globalThis, 'fetch', async (input: string) => input.includes('indexnow.org')
    ? new Response(null, { status: 202 }) : html(input));
  assert.deepEqual(await submitBlogDiscovery(['real'], { timeoutMs: 0 }), {
    liveUrls: [blogPostUrl('real')], indexNow: 'key-validation-pending',
    submittedSitemaps: ['https://acme-plumbing.example/sitemap.xml'],
  });
});

test('scorecard exposes missed publication days, alternate canonicals and citations of actual articles', async (t) => {
  const articles = [
    stored('2026-11-17'),
    { ...stored('2026-11-10'), slug: 'second-post', updatedAt: '2026-11-19' },
    { ...stored('2026-11-18'), status: 'review', slug: 'review-slug' },
  ];
  const runtime = configureTestEngine({}, {
    store: memory(articles),
    fetchGscPageQueries: async () => [],
    inspectUrl: async ({ url }) => url.endsWith('second-post')
      ? { verdict: 'PASS', coverageState: 'Submitted and indexed', googleCanonical: 'https://acme-plumbing.example/' }
      : { coverageState: 'Crawled - currently not indexed' },
    probeCitations: async () => [
      { provider: 'test', probeType: 'grounded', available: true, mentioned: false, citedUrls: [blogPostUrl(post.slug) + '?utm_source=ai#section'], checkedAt: today.toISOString() },
      { provider: 'test', probeType: 'grounded', available: true, mentioned: true, citedUrls: [runtime.config.identity.siteUrl], checkedAt: today.toISOString() },
    ],
  });
  t.mock.method(globalThis, 'fetch', async () => new Response('<item>'));
  const card = await runScorecard('/unused', { now: today, expectedCadenceDays: 1, liveProbe: false, citationQueries: ['prompt'] });
  const checks = Object.fromEntries(card.checks.map((check) => [check.name, check]));
  assert.equal(checks['daily-publication'].status, 'fail');
  assert.match(checks['daily-publication'].detail, /1\/7.*2026-11-18/);
  assert.match(checks.cadence.detail, /latest new post 3 days ago/);
  assert.match(checks['index-coverage'].detail, /0\/2.*Google-selected canonical differs/);
  assert.match(checks.citations.detail, /1\/2 available probes cited 1 distinct blog URLs/);
});

test('sitemap health resolves child XML and checks exact canonical membership', async (t) => {
  const index = 'https://example.com/sitemap-index.xml';
  const child = 'https://example.com/sitemap-blog.xml';
  const entry = 'https://example.com/blog/article/';
  t.mock.method(globalThis, 'fetch', async (url: string) => new Response(url === index
    ? `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${child}</loc></sitemap></sitemapindex>`
    : `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${entry}</loc></url></urlset>`));
  assert.deepEqual(await checkSitemapMembership(entry, [index]), { found: true, complete: true });
  assert.deepEqual(await checkSitemapMembership(entry.slice(0, -1), [index]), { found: false, complete: true });
});

test('future content and invented lastmod dates stay out of public discovery output', () => {
  configureTestEngine();
  const articles = [
    { ...stored('2026-11-17'), updatedAt: '2026-11-30' },
    { ...stored('2026-11-21'), slug: 'future' },
    { ...stored('2026-11-18'), slug: 'draft', status: 'draft' },
  ];
  const options = { now: today };
  assert.deepEqual(blogSitemapEntries(articles, options), [{ loc: blogPostUrl(post.slug), lastmod: '2026-11-17' }]);
  assert.equal(blogHubSitemapEntry(articles.slice(1), options).lastmod, undefined);
  const rss = buildBlogRss([
    { id: 'later', title: 'Later', description: '', date: new Date('2026-11-21') },
    { id: 'old', title: 'Old', description: '', date: new Date('2026-11-06') },
    { id: 'new', title: 'New', description: '', date: new Date('2026-11-17') },
  ], options);
  assert.doesNotMatch(rss, /Later/);
  assert.ok(rss.indexOf('>New<') < rss.indexOf('>Old<'));
  assert.match(rss, /<lastBuildDate>Tue, 17 Nov 2026/);
});

test('identical refresh does not write or mark the page newly modified', async () => {
  const article = stored('2026-08-01');
  const store = memory([article]);
  store.putPost = async () => assert.fail('no-op refresh accessed persistence');
  configureTestEngine({}, { store, fetchGscPageQueries: async () => [], generateText: async () => JSON.stringify(post) });
  const result = await refreshBlogRun('/unused', { slugs: [post.slug], dryRun: false });
  assert.deepEqual(result.refreshed, []);
});

test('Google OAuth errors respect the demand policy and sitemap HTTP failures remain visible', async (t) => {
  const keys = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN'];
  const saved = new Map(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) process.env[key] = 'test';
  t.after(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const { getGscQueries } = await import('../src/gsc.js');
  const fetch = t.mock.method(globalThis, 'fetch', async (url: string) => {
    assert.match(url, /oauth2/);
    return new Response(null, { status: 401 });
  });
  const runtime = configureTestEngine();
  assert.deepEqual(await getGscQueries(), { token: null, queries: [] });
  runtime.config.gsc.requireQuerySource = true;
  await assert.rejects(getGscQueries(), /Google token exchange failed with HTTP 401/);

  fetch.mock.mockImplementation(async (url: string) => {
    if (url.includes('oauth2')) return Response.json({ access_token: 'test' });
    if (url.includes('sitemaps')) return new Response(null, { status: 403 });
    if (url.includes('indexnow')) return new Response(null, { status: 200 });
    return html(url);
  });
  await assert.rejects(submitBlogDiscovery(['real'], { timeoutMs: 0 }), /Search Console.*HTTP 403/);
});
