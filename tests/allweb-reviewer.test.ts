import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createAllWebReviewer } from '../src/allweb-reviewer.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const siteId = '6b053b68-51a0-4cfd-98e3-835e584f995e';
const reviewer = () => createAllWebReviewer({
  apiUrl: 'https://allweb.test/site-agent', token: 'awt_reviewer', siteId,
});
const identity = (over: Record<string, unknown> = {}) => ({
  ok: true,
  client: { site_id: siteId, permissions: ['site:read', 'blog:read', 'blog:publish'], ...over },
});
const row = (over: Record<string, unknown> = {}) => ({
  site_id: siteId, slug: 'reviewed-post', status: 'review', revision: 4,
  title: 'Reviewed post', description: 'A complete review candidate', category: 'Guide',
  tags: ['review', 'guide'], answer: 'A complete answer', content: 'Complete body', read_mins: 5,
  faqs: [], sources: [], author: 'Accountable publisher',
  hero_image: '/hero.webp', hero_image_alt: 'Descriptive hero image',
  ...over,
});

test('reviewer releases only the exact inspected revision with no tenant selector', async () => {
  const calls: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body);
    if (body.action === 'whoami') return Response.json(identity());
    if (body.action === 'blog_get') return Response.json({ ok: true, post: row() });
    return Response.json({ ok: true, post: row({ status: 'published', revision: 5 }) });
  }) as typeof fetch;

  const result = await reviewer().releaseReviewedPost({ slug: 'reviewed-post', expectedRevision: 4 });
  assert.deepEqual(result, { slug: 'reviewed-post', revision: 5, status: 'published', changed: true });
  assert.deepEqual(calls.map((call) => call.action), ['whoami', 'blog_get', 'blog_publish']);
  assert.ok(calls.every((call) => !Object.hasOwn(call, 'site_id')));
  assert.equal(calls[2].expected_revision, 4);
});

test('reviewer retry resumes after publication without mutating again', async () => {
  const calls: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body);
    if (body.action === 'whoami') return Response.json(identity());
    return Response.json({ ok: true, post: row({ status: 'published', revision: 5 }) });
  }) as typeof fetch;

  const result = await reviewer().releaseReviewedPost({ slug: 'reviewed-post', expectedRevision: 4 });
  assert.deepEqual(result, { slug: 'reviewed-post', revision: 5, status: 'published', changed: false });
  assert.deepEqual(calls.map((call) => call.action), ['whoami', 'blog_get']);
});

test('reviewer rejects tenant drift and broader credentials before reading content', async () => {
  for (const badIdentity of [
    identity({ site_id: '00000000-0000-4000-8000-000000000000' }),
    identity({ permissions: ['site:read', 'blog:read', 'blog:write', 'blog:publish'] }),
  ]) {
    const calls: string[] = [];
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body.action);
      return Response.json(badIdentity);
    }) as typeof fetch;
    await assert.rejects(
      reviewer().releaseReviewedPost({ slug: 'reviewed-post', expectedRevision: 4 }),
      /tenant mismatch|scope mismatch/,
    );
    assert.deepEqual(calls, ['whoami']);
  }
});

test('reviewer fails closed on state, revision, response tenant, and invalid input', async () => {
  const scenarios: Array<{ current: Record<string, unknown>; pattern: RegExp }> = [
    { current: row({ status: 'draft' }), pattern: /must be in review state/ },
    { current: row({ status: 'archived' }), pattern: /must be in review state/ },
    { current: row({ revision: 5 }), pattern: /revision changed/ },
    { current: row({ site_id: '00000000-0000-4000-8000-000000000000' }), pattern: /tenant violation/ },
  ];
  for (const scenario of scenarios) {
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return Response.json(body.action === 'whoami' ? identity() : { ok: true, post: scenario.current });
    }) as typeof fetch;
    await assert.rejects(
      reviewer().releaseReviewedPost({ slug: 'reviewed-post', expectedRevision: 4 }),
      scenario.pattern,
    );
  }
  await assert.rejects(reviewer().releaseReviewedPost({ slug: '../bad', expectedRevision: 4 }), /invalid slug/);
  await assert.rejects(reviewer().releaseReviewedPost({ slug: 'reviewed-post', expectedRevision: 0 }), /positive integer/);
});

test('reviewer runs adopter preflight against the exact row and published corpus before mutation', async () => {
  const calls: Array<Record<string, unknown>> = [];
  let received: any;
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body);
    if (body.action === 'whoami') return Response.json(identity());
    if (body.action === 'blog_get') return Response.json({ ok: true, post: row() });
    if (body.action === 'blog_list') return Response.json({
      ok: true,
      posts: [row({ slug: 'published-guide', status: 'published', revision: 9 })],
      pagination: { has_more: false },
    });
    return Response.json({ ok: true, post: row({ status: 'published', revision: 5 }) });
  }) as typeof fetch;

  const client = createAllWebReviewer({
    apiUrl: 'https://allweb.test/site-agent', token: 'awt_reviewer', siteId,
    validatePost(args) { received = args; return []; },
  });
  await client.releaseReviewedPost({ slug: 'reviewed-post', expectedRevision: 4 });

  assert.deepEqual(calls.map((call) => call.action), ['whoami', 'blog_get', 'blog_list', 'blog_publish']);
  assert.equal(received.post.slug, 'reviewed-post');
  assert.equal(received.post.revision, 4);
  assert.equal(received.post.heroImage, '/hero.webp');
  assert.deepEqual(received.existingPublishedSlugs, ['published-guide']);
});

test('reviewer fails closed on structural or adopter validation without publishing', async () => {
  for (const scenario of [
    { current: row({ hero_image: '' }), validatePost: undefined, pattern: /hero image is required/ },
    { current: row(), validatePost: () => ['site renderer rejects answer'], pattern: /site renderer rejects answer/ },
  ]) {
    const calls: string[] = [];
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body.action);
      if (body.action === 'whoami') return Response.json(identity());
      if (body.action === 'blog_get') return Response.json({ ok: true, post: scenario.current });
      if (body.action === 'blog_list') return Response.json({ ok: true, posts: [], pagination: { has_more: false } });
      throw new Error('blog_publish must not be reached');
    }) as typeof fetch;
    const client = createAllWebReviewer({
      apiUrl: 'https://allweb.test/site-agent', token: 'awt_reviewer', siteId,
      ...(scenario.validatePost ? { validatePost: scenario.validatePost } : {}),
    });
    await assert.rejects(client.releaseReviewedPost({ slug: 'reviewed-post', expectedRevision: 4 }), scenario.pattern);
    assert.ok(!calls.includes('blog_publish'));
  }
});

test('reviewer rejects a foreign row while assembling preflight corpus', async () => {
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.action === 'whoami') return Response.json(identity());
    if (body.action === 'blog_get') return Response.json({ ok: true, post: row() });
    return Response.json({
      ok: true,
      posts: [row({ site_id: '00000000-0000-4000-8000-000000000000', status: 'published' })],
      pagination: { has_more: false },
    });
  }) as typeof fetch;
  const client = createAllWebReviewer({
    apiUrl: 'https://allweb.test/site-agent', token: 'awt_reviewer', siteId,
    validatePost: () => [],
  });
  await assert.rejects(
    client.releaseReviewedPost({ slug: 'reviewed-post', expectedRevision: 4 }),
    /tenant violation in blog_list/,
  );
});
