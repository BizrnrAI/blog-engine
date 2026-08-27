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
  site_id: siteId, slug: 'reviewed-post', status: 'review', revision: 4, ...over,
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
