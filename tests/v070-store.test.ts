import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';
import { auditPosts } from '../src/audit.js';
import { generateBlogRun } from '../src/publisher.js';
import { refreshBlogRun } from '../src/refresh.js';
import { runScorecard } from '../src/scorecard.js';
import { formatServiceReport, runBlogService } from '../src/service.js';
import { createFileStore, getStore } from '../src/store.js';
import { createSupabaseStore } from '../src/supabase-store.js';
import { createAllWebStore } from '../src/allweb-store.js';
import type { BlogEngineRuntime, BlogStore, ParsedBlogPost, PutPostArgs, ServiceSite } from '../src/types.js';
import { configureTestEngine, testConfig, validPost } from './helpers.js';

/** An in-memory store — the same contract a Supabase store implements, without the network. */
function memoryStore(seed: ParsedBlogPost[] = []): BlogStore & { posts: ParsedBlogPost[]; assets: Map<string, Buffer> } {
  const posts = [...seed];
  const assets = new Map<string, Buffer>();
  return {
    name: 'memory',
    posts,
    assets,
    async listPosts() { return [...posts]; },
    async putPost({ post, cover, markdown, dateISO, isRefresh }: PutPostArgs) {
      const existing = posts.findIndex((p) => p.slug === post.slug);
      const row: ParsedBlogPost = {
        slug: post.slug, title: post.title, description: post.description, category: post.category,
        tags: post.tags, author: '', publishedAt: isRefresh && existing >= 0 ? posts[existing].publishedAt : dateISO,
        updatedAt: dateISO, heroImage: cover.image, heroImageAlt: cover.imageAlt, ogImage: cover.ogImage,
        heroImageWidth: cover.width, heroImageHeight: cover.height,
        answer: post.answer, content: post.body, faqs: post.faqs.map((f) => ({ question: f.q, answer: f.a })), body: [],
      };
      if (existing >= 0) posts[existing] = row; else posts.push(row);
      assert.ok(markdown.startsWith('---'), 'store receives the rendered markdown too');
      return `memory:${post.slug}`;
    },
    async putAsset(key, data) { assets.set(key, data); return `https://cdn.example${key}`; },
  };
}

function runtimeWith(store: BlogStore, hooks: Record<string, unknown> = {}): BlogEngineRuntime {
  return {
    config: testConfig(),
    topics: {
      allowedCategories: ['Guides'], crossPromoEvery: 4, gradients: ['g1'],
      heroPhotos: [{ url: '/assets/fallback.jpg', alt: 'Fallback' }],
      internalLinks: ['/', '/blog', '/services/drain-cleaning'],
      editorial: [{ keyword: 'winter pipe care', category: 'Guides', angle: 'prevention' }],
      crossPromo: [],
    },
    brandPersona: () => 'persona',
    hooks: { store, generateText: async () => JSON.stringify(validPost()), ...hooks },
  };
}

beforeEach(() => {
  configureTestEngine();
});

test('the default store is the filesystem and behaves exactly as before', async () => {
  configureTestEngine({}, { generateText: async () => JSON.stringify(validPost()) });
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-file-'));
  assert.equal(getStore(root).name, 'file');
  await generateBlogRun(root, { count: 1, dryRun: false, skipPing: true });
  assert.ok(existsSync(join(root, 'src/content/blog/drain-cleaning-cost-springfield.md')));
  assert.ok(readFileSync(join(root, 'src/content/blog/drain-cleaning-cost-springfield.md'), 'utf8').startsWith('---'));
});

test('a store-backed site publishes with no filesystem writes at all', async () => {
  const store = memoryStore();
  const { configureBlogEngine } = await import('../src/config.js');
  configureBlogEngine(runtimeWith(store));
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-store-'));
  const result = await generateBlogRun(root, { count: 1, dryRun: false, skipPing: true });

  assert.deepEqual(result.written, ['drain-cleaning-cost-springfield']);
  assert.equal(store.posts.length, 1);
  assert.equal(store.posts[0].title, validPost().title);
  assert.equal(store.posts[0].publishedAt, new Date().toISOString().slice(0, 10));
  assert.equal(existsSync(join(root, 'src/content/blog')), false, 'nothing was written to disk');
  // Curated fallback hero (no image model configured) → no asset upload for this run.
  assert.equal(store.posts[0].heroImage, '/assets/fallback.jpg');
});

test('cadence, audit, refresh and the scorecard all read through the store', async () => {
  const iso = (d: number) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  const seeded: ParsedBlogPost[] = [
    { slug: 'a', title: 'A', description: 'd', category: 'Guides', tags: ['t'], author: '', publishedAt: iso(1), updatedAt: iso(1), heroImage: '/a.webp', heroImageAlt: 'a', answer: 'x', content: 'short', faqs: [], body: [] },
    { slug: 'b', title: 'B', description: 'd', category: 'Guides', tags: ['t'], author: '', publishedAt: iso(2), updatedAt: iso(2), heroImage: '/b.webp', heroImageAlt: 'b', answer: 'x', content: 'short', faqs: [], body: [] },
  ];
  const store = memoryStore(seeded);
  const { configureBlogEngine } = await import('../src/config.js');
  const rt = runtimeWith(store);
  rt.config.content = { maxPostsPerWeek: 2 };
  configureBlogEngine(rt);
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-store2-'));

  // Cadence guard counts rows, not files.
  const capped = await generateBlogRun(root, { count: 1, dryRun: false, skipPing: true });
  assert.equal(capped.skipped, 'CADENCE_CAP');
  assert.equal(store.posts.length, 2, 'nothing published while capped');

  // Audit works on store rows.
  const audit = auditPosts(await store.listPosts());
  assert.equal(audit.length, 2);
  assert.ok(audit.every((e) => e.verdict === 'BLOCK'), 'thin seeded posts are blocked');

  // Scorecard reads the store for cadence + corpus.
  const card = await runScorecard(root, { liveProbe: false, now: new Date() });
  const by = Object.fromEntries(card.checks.map((c) => [c.name, c]));
  assert.equal(by.cadence.status, 'pass', by.cadence.detail);
  assert.ok(by.corpus.detail.includes('2 posts'));
});

test('refresh rewrites a stored post in place, keeping its publish date', async () => {
  const published = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
  const store = memoryStore([{
    slug: 'drain-cleaning-cost-springfield', title: 'Old Title', description: 'old', category: 'Guides',
    tags: ['t'], author: 'Alex Acme', publishedAt: published, updatedAt: published,
    heroImage: '/hero.webp', heroImageAlt: 'hero alt', ogImage: '/og.jpg', heroImageWidth: 1536, heroImageHeight: 1024,
    answer: 'old answer', content: Array(320).fill('word').join(' '), faqs: [], body: [],
  }]);
  const { configureBlogEngine } = await import('../src/config.js');
  configureBlogEngine(runtimeWith(store));
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-store3-'));

  const result = await refreshBlogRun(root, { slugs: ['drain-cleaning-cost-springfield'], dryRun: false });
  assert.deepEqual(result.refreshed, ['drain-cleaning-cost-springfield']);
  assert.equal(store.posts.length, 1, 'refreshed in place, not duplicated');
  assert.equal(store.posts[0].publishedAt, published, 'publish date preserved');
  assert.equal(store.posts[0].updatedAt, new Date().toISOString().slice(0, 10));
  assert.equal(store.posts[0].title, validPost().title, 'content was regenerated');
  assert.equal(store.posts[0].heroImage, '/hero.webp', 'hero preserved');
});

test('the service publishes across sites, isolates failures, and honours schedules', async () => {
  const good = memoryStore();
  const sites: ServiceSite[] = [
    { id: 'site-a', runtime: () => runtimeWith(good), root: mkdtempSync(join(tmpdir(), 'svc-a-')) },
    { id: 'site-b', runtime: () => { throw new Error('adapter exploded'); }, root: '/tmp' },
    { id: 'site-c', runtime: () => runtimeWith(memoryStore()), enabled: false },
    { id: 'site-d', runtime: () => runtimeWith(memoryStore()), days: [(new Date().getUTCDay() + 1) % 7] },
  ];
  const results = await runBlogService(sites, { now: new Date() });
  const by = Object.fromEntries(results.map((r) => [r.site, r]));

  assert.equal(by['site-a'].status, 'published');
  assert.deepEqual(by['site-a'].published, ['drain-cleaning-cost-springfield']);
  assert.equal(good.posts.length, 1);
  assert.equal(by['site-b'].status, 'failed', 'one bad site does not stop the fleet');
  assert.ok(by['site-b'].detail?.includes('adapter exploded'));
  assert.equal(by['site-c'].status, 'skipped');
  assert.equal(by['site-c'].detail, 'disabled');
  assert.equal(by['site-d'].status, 'skipped');
  assert.equal(by['site-d'].detail, 'not scheduled today');

  const report = formatServiceReport(results);
  assert.ok(report.includes('1 post(s) across 4 site(s), 1 failed'));
  assert.ok(report.includes('+drain-cleaning-cost-springfield'));

  const only = await runBlogService(sites, { only: ['site-c'] });
  assert.equal(only.length, 1);
});

// ---- Supabase store: contract, without a network ----
test('createSupabaseStore builds correct PostgREST and Storage requests', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/storage/')) return new Response('{}', { status: 200 });
    if (init.method === 'POST') return new Response('', { status: 201 });
    return new Response(JSON.stringify([{
      slug: 'row-post', title: 'Row Post', description: 'from postgres', category: 'Guides',
      tags: ['db'], author: 'Alex', published_at: '2026-08-01', updated_at: '2026-08-20',
      hero_image: 'https://cdn/x.webp', hero_image_alt: 'alt', hero_image_width: 1536, hero_image_height: 1024,
      read_mins: 6, answer: 'A stored answer.', content: '## Heading?\nBody text.',
      faqs: [{ question: 'Q?', answer: 'A.' }], sources: [],
    }]), { status: 200 });
  }) as typeof fetch;

  try {
    const store = createSupabaseStore({ url: 'https://proj.supabase.co', serviceKey: 'service-key', siteId: 'acme' });
    assert.equal(store.name, 'supabase:blog_posts');

    const posts = await store.listPosts();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].slug, 'row-post');
    assert.equal(posts[0].readMins, 6);
    assert.equal(posts[0].faqs[0].question, 'Q?');
    assert.ok(posts[0].body.length, 'markdown body is sectioned for render helpers');
    assert.ok(calls[0].url.includes('site_id=eq.acme') && calls[0].url.includes('status=eq.published'));

    await store.putPost({ post: validPost(), cover: { image: '/h.webp', imageAlt: 'a', ogImage: '/o.jpg', source: 'ai-generated' }, markdown: '---\nx\n---', dateISO: '2026-08-24', isRefresh: false });
    const upsert = calls[1];
    assert.ok(upsert.url.includes('on_conflict=site_id,slug'), 'upsert, not insert');
    assert.match(String((upsert.init.headers as Record<string, string>).Prefer), /merge-duplicates/);
    const body = JSON.parse(String(upsert.init.body));
    assert.equal(body.site_id, 'acme');
    assert.equal(body.published_at, '2026-08-24');
    assert.equal(body.status, 'published');
    assert.deepEqual(body.faqs[0], { question: validPost().faqs[0].q, answer: validPost().faqs[0].a });

    await store.putPost({ post: validPost(), cover: { image: '/h.webp', imageAlt: 'a', ogImage: '/o.jpg', source: 'ai-generated' }, markdown: '---\nx\n---', dateISO: '2026-08-24', isRefresh: true });
    assert.equal(JSON.parse(String(calls[2].init.body)).published_at, undefined, 'a refresh never moves the publish date');

    assert.ok(store.putAsset, 'the Supabase store handles assets');
    const url = await store.putAsset('/assets/blog/x.webp', Buffer.from('img'), 'image/webp');
    assert.equal(url, 'https://proj.supabase.co/storage/v1/object/public/blog-assets/acme/assets/blog/x.webp');
    assert.equal((calls[3].init.headers as Record<string, string>)['x-upsert'], 'true');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('createSupabaseStore fails fast on missing credentials', () => {
  const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.throws(() => createSupabaseStore({ siteId: 'x' }), /missing url/);
    assert.throws(() => createSupabaseStore({ siteId: 'x', url: 'https://p.supabase.co' }), /missing serviceKey/);
    assert.throws(() => createSupabaseStore({ siteId: '', url: 'https://p.supabase.co', serviceKey: 'k' }), /missing siteId/);
  } finally {
    if (url) process.env.SUPABASE_URL = url;
    if (key) process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  }
});

test('createAllWebStore uses only the site-agent gateway and preserves optimistic revisions', async () => {
  const calls: Record<string, any>[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL, init: RequestInit = {}) => {
    const body = JSON.parse(String(init.body));
    calls.push({ headers: init.headers, body });
    if (body.action === 'blog_list') return Response.json({ ok: true, posts: [{
      slug: 'existing', title: 'Existing', description: 'stored', category: 'Guides', tags: [],
      author: 'Alex', published_at: '2026-08-01', updated_at: '2026-08-01', answer: 'Answer',
      content: '## Heading\nBody', faqs: [], sources: [], status: 'published',
    }] });
    if (body.action === 'blog_get') return Response.json({ ok: true, post: { slug: body.slug, revision: 7 } });
    if (body.action === 'blog_asset_upload') return Response.json({ ok: true, asset: { public_url: 'https://cdn.example/x.webp' } });
    return Response.json({ ok: true, post: { slug: body.slug, revision: 8 } });
  }) as typeof fetch;

  try {
    const store = createAllWebStore({
      apiUrl: 'https://allweb.example/functions/v1/site-agent', token: 'awt_scoped',
      siteId: '6b053b68-51a0-4cfd-98e3-835e584f995e', author: 'Alex',
    });
    assert.equal(store.name, 'allweb:6b053b68-51a0-4cfd-98e3-835e584f995e');
    assert.equal((await store.listPosts())[0].slug, 'existing');
    await store.putPost({
      post: validPost(), cover: { image: '/h.webp', imageAlt: 'a', ogImage: '/o.jpg', source: 'ai-generated' },
      markdown: '---\nx\n---', dateISO: '2026-08-26', isRefresh: true,
    });
    const write = calls.find((call) => call.body.action === 'blog_upsert');
    assert.ok(write);
    assert.equal(write.body.site_id, '6b053b68-51a0-4cfd-98e3-835e584f995e');
    assert.equal(write.body.expected_revision, 7);
    assert.equal(write.body.status, 'published');
    assert.equal(String((write.headers as Record<string, string>).Authorization), 'Bearer awt_scoped');
    assert.equal(JSON.stringify(calls).includes('service_role'), false);

    const assetUrl = await store.putAsset!('/assets/blog/x.webp', Buffer.from('img'), 'image/webp');
    assert.equal(assetUrl, 'https://cdn.example/x.webp');
    const asset = calls.find((call) => call.body.action === 'blog_asset_upload');
    assert.ok(asset);
    assert.equal(asset.body.path, 'assets/blog/x.webp');
    assert.equal(asset.body.data_base64, Buffer.from('img').toString('base64'));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('createFileStore round-trips a post and an asset', async () => {
  configureTestEngine();
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-fs-'));
  const store = createFileStore(root);
  await store.putPost({ post: validPost(), cover: { image: '/i.webp', imageAlt: 'a', ogImage: '/o.jpg', source: 'ai-generated' }, markdown: '---\ntitle: "T"\ndate: 2026-08-24\n---\nBody', dateISO: '2026-08-24', isRefresh: false });
  const listed = await store.listPosts();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].title, 'T');
  const putAsset = store.putAsset!;
  const url = await putAsset('/assets/blog/y.webp', Buffer.from('bytes'), 'image/webp');
  assert.equal(url, '/assets/blog/y.webp', 'file store returns the same public path it always did');
  assert.ok(existsSync(join(root, 'public/assets/blog/y.webp')));
});
