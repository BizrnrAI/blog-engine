import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createAllWebGscHooks } from '../src/allweb-gsc.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('AllWeb GSC hooks send only site-bound actions and reject foreign responses', async () => {
  const bodies: Array<Record<string, any>> = [];
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    const payload = body.action === 'gsc_queries'
      ? { ok: true, site_id: 'site-1', queries: [{ query: 'probate help', impressions: 4 }] }
      : body.action === 'gsc_page_queries'
        ? { ok: true, site_id: 'site-1', rows: [{ page: 'https://example.test/blog/x/', query: 'probate help', impressions: 4, clicks: 1, position: 9 }] }
        : { ok: true, site_id: 'site-1', submitted: body.sitemaps };
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;

  const hooks = createAllWebGscHooks({
    apiUrl: 'https://allweb.test/site-agent',
    token: 'site-token',
    siteId: 'site-1',
  });
  assert.deepEqual(await hooks.fetchGscQueries!({ property: 'ignored', siteUrl: 'https://example.test', days: 28 }), [
    { query: 'probate help', impressions: 4 },
  ]);
  assert.equal((await hooks.fetchGscPageQueries!({ property: 'ignored', siteUrl: 'https://example.test', days: 28, pathPrefix: '/blog/' }))[0].position, 9);
  await hooks.submitSitemap!({ property: 'ignored', sitemap: 'https://example.test/sitemap-blog.xml' });
  assert.deepEqual(bodies.map((body) => body.action), ['gsc_queries', 'gsc_page_queries', 'gsc_submit_sitemaps']);
  assert.ok(bodies.every((body) => body.site_id === 'site-1'));
  assert.deepEqual(bodies[2].sitemaps, ['https://example.test/sitemap-blog.xml']);

  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, site_id: 'site-2', queries: [] }), { status: 200 })) as typeof fetch;
  await assert.rejects(
    hooks.fetchGscQueries!({ property: 'ignored', siteUrl: 'https://example.test', days: 28 }),
    /crossed the configured site boundary/,
  );
});
