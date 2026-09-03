import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureTestEngine, validPost } from './helpers.js';
import { generateBlogPost, normalizeGeneratedPost, validateGeneratedPost } from '../src/generate-post.js';
import { generateBlogRun } from '../src/publisher.js';
import { hasEmDash } from '../src/punctuation.js';
import { withBlogEngineRuntime, getBlogConfig } from '../src/config.js';
import { runBlogService } from '../src/service.js';
import { createSupabaseStore } from '../src/supabase-store.js';
import { createSupabaseBlogReader } from '../src/supabase-reader.js';
import { refreshBlogPost } from '../src/refresh.js';
import { storedRowToPost } from '../src/stored-row.js';
import { waitUntilBlogUrlsLive } from '../src/indexing.js';
import { blogGenerateWorkflow, blogRefreshWorkflow, blogIndexingWorkflow } from '../src/workflows.js';
import { crawlerBlocked, RETRIEVAL_CRAWLERS } from '../src/scorecard.js';
import { serializeBlogJsonLd } from '../src/schema.js';
import type { BlogStore, SeoTopic } from '../src/types.js';

const topic: SeoTopic = { type: 'editorial', keyword: 'drains', category: 'Guides', angle: 'prevention', mustBacklink: false };
const cover = { image: '/hero.webp', imageAlt: 'A sink', ogImage: '/og.jpg', source: 'ai-generated' as const };
const args = () => ({ post: validPost(), cover, markdown: '---\ntitle: example\n---\nBody', dateISO: '2026-09-03', isRefresh: false });
const row = (slug = 'first') => ({ site_id: 'site', status: 'published', slug, title: slug, published_at: '2026-01-01', content: validPost().body });
const options = { siteId: 'site', url: 'https://example.supabase.co', serviceKey: 'server-only', pageSize: 1 };
const memory = (): BlogStore => ({ name: 'memory', publicationStatus: 'published', listPosts: async () => [], putPost: async () => 'stored', putAsset: async (key) => `https://cdn.example${key}` });

test('em dashes and entities are repaired in every generated prose field', () => {
  configureTestEngine();
  const raw = { ...validPost(), title: 'Pipe care—made clear', description: validPost().description + ' &mdash; More.',
    answer: validPost().answer + ' &#8212;', body: validPost().body + '\n&#x2014; Done.',
    heroImageAlt: 'Kitchen—sink', tags: ['pipes—care', 'repair'],
    faqs: validPost().faqs.map((faq) => ({ q: faq.q + '—', a: faq.a + '&mdash;' })),
    sources: [{ title: 'Guide—repairs', publisher: 'Owner—publisher', url: 'https://example.org/source' }] };
  const normalized = normalizeGeneratedPost(raw);
  assert.equal(hasEmDash(normalized), false);
  assert.equal(normalized.title, 'Pipe care - made clear');
  assert.ok(validateGeneratedPost(raw, { topic, existingSlugs: [] }).some((e) => /em dashes/.test(e)));
  assert.ok(validateGeneratedPost(normalizeGeneratedPost(raw, { title: 'Pinned—title' }), { topic, existingSlugs: [] }).some((e) => /em dashes/.test(e)));
});

test('custom rendering cannot reintroduce an em dash at publication', async () => {
  let writes = 0;
  const store = memory(); store.putPost = async () => { writes++; return 'stored'; };
  configureTestEngine({}, { store, generateText: async () => JSON.stringify(validPost()), renderMarkdown: () => 'Bad &mdash; renderer' });
  await assert.rejects(generateBlogRun('/unused', { count: 1, dryRun: false, skipPing: true }), /em dashes/);
  assert.equal(writes, 0);
});

test('direct Supabase calls cannot persist forbidden punctuation', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not call network'); });
  await assert.rejects(createSupabaseStore(options).putPost({ ...args(), markdown: 'Bad—post' }), /em dashes/);
});

test('source validation also runs when sources are optional', async () => {
  let calls = 0;
  configureTestEngine({}, { generateText: async () => JSON.stringify({ ...validPost(), sources: [{ title: 'Evidence', url: 'https://example.org/dead' }] }), verifySource: async () => { calls++; return false; } });
  await assert.rejects(generateBlogPost(topic, []), /source URL does not resolve/);
  assert.equal(calls, 3);
});

test('refresh retries dead citations and never persists unsupported source URLs', async () => {
  let writes = 0;
  const store = memory(); store.listPosts = async () => [storedRowToPost({ ...row(validPost().slug), category: 'Guides' })];
  store.putPost = async () => { writes++; return 'stored'; };
  let modelCalls = 0;
  configureTestEngine({ content: { requireSources: true } }, { store, verifySource: async () => false, generateText: async ({ messages }) => {
    modelCalls++;
    assert.ok(messages.some((m) => m.content.includes('"sources"')));
    return JSON.stringify({ ...validPost(), sources: [{ title: 'One', url: 'https://example.org/one' }, { title: 'Two', url: 'https://example.org/two' }] });
  } });
  await assert.rejects(refreshBlogPost('/unused', validPost().slug), /source URL does not resolve/);
  assert.equal(modelCalls, 3); assert.equal(writes, 0);
});

test('Supabase corpus pagination reads beyond server-truncated pages', async (t) => {
  const offsets: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.ok(init.signal); const offset = new URL(url).searchParams.get('offset')!; offsets.push(offset);
    return Response.json(Number(offset) < 2 ? [row(`post-${offset}`)] : []);
  });
  const posts = await createSupabaseStore({ ...options, pageSize: 200 }).listPosts();
  assert.equal(posts.length, 2); assert.deepEqual(offsets, ['0', '1', '2']);
});

test('Supabase rejects foreign tenants and broken pagination', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json([{ ...row(), site_id: 'foreign' }]));
  await assert.rejects(createSupabaseStore(options).listPosts(), /foreign tenant/);
  fetch.mock.mockImplementation(async () => Response.json([row()]));
  await assert.rejects(createSupabaseStore(options).listPosts(), /pagination repeated/);
});

test('duplicate generation fails rather than overwriting; refresh cannot create missing rows', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    assert.equal(init.method, 'POST'); assert.doesNotMatch(String(init.headers), /merge-duplicates/);
    return new Response('', { status: 409 });
  });
  await assert.rejects(createSupabaseStore(options).putPost(args()), /insert HTTP 409/);
  fetch.mock.mockImplementation(async (_url: string, init: RequestInit) => {
    assert.equal(init.method, 'PATCH'); assert.equal(JSON.parse(String(init.body)).published_at, undefined);
    return Response.json([]);
  });
  await assert.rejects(createSupabaseStore(options).putPost({ ...args(), isRefresh: true }), /exactly one/);
});

test('website reader uses public credentials, live database rows, and throws on outages', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(init.cache, 'no-store'); assert.equal((init.headers as Record<string, string>).apikey, 'public-key');
    const q = new URL(url).searchParams; assert.equal(q.get('status'), 'eq.published');
    if (q.has('slug')) return Response.json([row()]);
    return Response.json(q.get('offset') === '0' ? [row()] : []);
  });
  const reader = createSupabaseBlogReader({ ...options, anonKey: 'public-key' });
  assert.equal((await reader.listPublishedPosts()).length, 1);
  assert.equal((await reader.getPublishedPost('first'))?.slug, 'first');
  fetch.mock.mockImplementation(async () => new Response('', { status: 503 }));
  await assert.rejects(reader.listPublishedPosts(), /HTTP 503/);
});

test('reader never returns drafts, future rows, or another site', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json([{ ...row(), status: 'draft' }]));
  const reader = createSupabaseBlogReader({ ...options, anonKey: 'public-key' });
  await assert.rejects(reader.getPublishedPost('first'), /unpublished or foreign/);
  fetch.mock.mockImplementation(async () => Response.json([{ ...row(), published_at: '2999-01-01' }]));
  await assert.rejects(reader.getPublishedPost('first'), /unpublished or foreign/);
});

test('concurrent runtimes cannot leak another website identity across awaits', async () => {
  const first = configureTestEngine();
  const second = { ...first, config: { ...first.config, identity: { ...first.config.identity, name: 'Other Brand' } } };
  await Promise.all([first, second].map((runtime) => withBlogEngineRuntime(runtime, async () => {
    const name = runtime.config.identity.name;
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(getBlogConfig().identity.name, name);
  })));
});

test('service dry run does no paid work, persistence, or filesystem creation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'blog-dry-'));
  const runtime = configureTestEngine({}, { store: memory(), generateText: async () => { throw new Error('paid model called'); } });
  const results = await runBlogService([{ id: 'site', runtime: () => runtime, root }], { dryRun: true });
  assert.equal(results[0].status, 'nothing-to-do');
  assert.deepEqual(readdirSync(root), []);
});

test('autonomous service refuses filesystem fallback and draft/published mismatches', async () => {
  const runtime = configureTestEngine();
  const [file] = await runBlogService([{ id: 'site', runtime: () => runtime }], { dryRun: true });
  assert.match(file.detail!, /remote BlogStore/);
  runtime.hooks = { store: { ...memory(), publicationStatus: 'draft' } };
  const [draft] = await runBlogService([{ id: 'site', runtime: () => runtime }], { dryRun: true });
  assert.match(draft.detail!, /publication policy mismatch/);
});

test('service keeps successful publication evidence if indexing fails', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string) => new Response('', { status: String(url).includes('indexnow.org') ? 503 : 200 }));
  const runtime = configureTestEngine({}, { store: memory(), generateText: async () => JSON.stringify(validPost()) });
  const [result] = await runBlogService([{ id: 'site', runtime: () => runtime }]);
  assert.equal(result.status, 'failed'); assert.deepEqual(result.published, [validPost().slug]);
  assert.match(result.detail!, /IndexNow/);
});

test('live verification rejects redirects and error pages', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 302, headers: { location: '/' } }));
  await assert.rejects(waitUntilBlogUrlsLive(['https://example.org/blog/post'], 0), /Timed out/);
  fetch.mock.mockImplementation(async () => new Response('', { status: 200 }));
  await waitUntilBlogUrlsLive(['https://example.org/blog/post'], 0);
});

test('workflow builders publish directly and take their schedules from the website', () => {
  for (const workflow of [blogGenerateWorkflow(), blogRefreshWorkflow(), blogIndexingWorkflow()]) {
    assert.doesNotMatch(workflow, /create-pull-request|pull-requests: write|contents: write|git diff|git log/);
    assert.doesNotMatch(workflow, /schedule:/);
    assert.match(workflow, /BLOG_SLUGS:/);
  }
  const generate = blogGenerateWorkflow({ generateCron: '0 8 * * 1' });
  assert.match(generate, /cron: "0 8 \* \* 1"/);
  assert.match(generate, /BLOG_REQUIRE_REMOTE_STORE/);
  assert.match(generate, /--count="\$BLOG_COUNT"/);
});

test('crawl checks honor wildcard groups, grouped agents, allow precedence and path patterns', () => {
  assert.equal(crawlerBlocked('User-agent: *\nDisallow: /', 'Googlebot', '/blog/'), true);
  assert.equal(crawlerBlocked('User-agent: *\nDisallow: /\nUser-agent: Googlebot\nAllow: /blog', 'Googlebot', '/blog/'), false);
  assert.equal(crawlerBlocked('User-agent: OAI-SearchBot\nUser-agent: Googlebot\nDisallow: /blog', 'Googlebot', '/blog/'), true);
  assert.equal(crawlerBlocked('User-agent: *\nDisallow: /blog/*\nAllow: /blog/public', 'Googlebot', '/blog/public'), false);
  assert.equal(crawlerBlocked('User-agent: *\nDisallow: /blog$', 'Googlebot', '/blog/post'), false);
  assert.ok(RETRIEVAL_CRAWLERS.includes('Googlebot'));
});

test('model HTML and script-breaking JSON-LD never become executable page markup', () => {
  configureTestEngine();
  assert.ok(validateGeneratedPost({ ...validPost(), body: validPost().body + '<script>alert(1)</script>' }, { topic, existingSlugs: [] }).some((e) => /plain Markdown/.test(e)));
  const serialized = serializeBlogJsonLd({ headline: '</script><script>alert(1)</script>' });
  assert.doesNotMatch(serialized, /</);
  assert.equal(JSON.parse(serialized).headline, '</script><script>alert(1)</script>');
});

test('a partially failed multi-post batch retains the slugs already persisted', async () => {
  const store = memory();
  let attempts = 0;
  configureTestEngine({}, { store, generateText: async () => {
    attempts++;
    return JSON.stringify(attempts === 1 ? validPost() : { ...validPost(), slug: 'second', title: 'Second post', body: '<script>bad</script>' });
  } });
  await assert.rejects(generateBlogRun('/unused', { count: 2, dryRun: false, skipPing: true }), (error: any) => {
    assert.equal(error.name, 'BlogRunError');
    assert.deepEqual(error.written, [validPost().slug]);
    return true;
  });
});
