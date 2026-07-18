import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';
import { buildBlogRss, type RssPost } from '../src/rss.js';
import { configureTestEngine } from './helpers.js';

beforeEach(() => {
  configureTestEngine();
});

const post: RssPost = {
  id: 'drain-cleaning-cost-springfield',
  title: 'How Much Does Drain Cleaning Cost?',
  description: 'Pricing guide.',
  date: new Date('2026-07-18T12:00:00Z'),
  image: '/assets/blog/generated/drain.webp',
  imageAlt: 'Plumber at work',
};

test('feed includes atom self link, media tags, and correct mime', () => {
  const xml = buildBlogRss([post]);
  assert.ok(xml.includes('rel="self"'));
  assert.ok(xml.includes('type="image/webp"'));
  assert.ok(xml.includes('<media:description type="plain">Plumber at work</media:description>'));
  assert.ok(xml.includes('<guid isPermaLink="true">https://acme-plumbing.example/blog/drain-cleaning-cost-springfield</guid>'));
});

test('enclosure length is the real byte size when root is provided', () => {
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-rss-'));
  const dir = join(root, 'public/assets/blog/generated');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'drain.webp'), Buffer.alloc(1234));

  const xml = buildBlogRss([post], { root });
  assert.ok(xml.includes('length="1234"'), 'expected real byte length in enclosure');
});

test('enclosure length falls back to 0 when the file is missing', () => {
  const xml = buildBlogRss([post], { root: '/nonexistent-root' });
  assert.ok(xml.includes('length="0"'));
});

test('rss limit is respected', () => {
  configureTestEngine({ rss: { title: 'T', description: 'D', path: '/blog/feed.xml', limit: 1 } });
  const xml = buildBlogRss([post, { ...post, id: 'second-post' }]);
  assert.equal((xml.match(/<item>/g) || []).length, 1);
});
