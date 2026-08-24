import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';
import sharp from 'sharp';
import { contentExtensions, isPostFile, readGeneratedBlogPosts, slugFromFile } from '../src/content-reader.js';
import { readExistingPosts } from '../src/existing-posts.js';
import { makeOgCard } from '../src/images.js';
import { generateBlogRun } from '../src/publisher.js';
import { refreshBlogPost } from '../src/refresh.js';
import type { PersistPostArgs } from '../src/types.js';
import { configureTestEngine, validPost } from './helpers.js';

function emptyRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-v060-'));
  mkdirSync(join(root, 'src/content/blog'), { recursive: true });
  return root;
}

beforeEach(() => {
  configureTestEngine();
});

// ---------- GAP 1: persistence seam ----------

test('with no persistPost hook the engine writes the file exactly as before', async () => {
  configureTestEngine({}, { generateText: async () => JSON.stringify(validPost()) });
  const root = emptyRoot();
  const result = await generateBlogRun(root, { count: 1, dryRun: false, skipPing: true });
  assert.deepEqual(result.written, ['drain-cleaning-cost-springfield']);
  assert.ok(existsSync(join(root, 'src/content/blog/drain-cleaning-cost-springfield.md')));
});

test('persistPost returning nothing owns persistence: no file is written', async () => {
  const seen: PersistPostArgs[] = [];
  configureTestEngine({}, {
    generateText: async () => JSON.stringify(validPost()),
    persistPost: async (args) => { seen.push(args); },
  });
  const root = emptyRoot();
  const result = await generateBlogRun(root, { count: 1, dryRun: false, skipPing: true });
  assert.deepEqual(result.written, ['drain-cleaning-cost-springfield'], 'still reported as published');
  assert.equal(existsSync(join(root, 'src/content/blog/drain-cleaning-cost-springfield.md')), false);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].post.slug, 'drain-cleaning-cost-springfield');
  assert.equal(seen[0].isRefresh, false);
  assert.equal(seen[0].root, root);
  assert.ok(seen[0].markdown.startsWith('---'), 'hook receives the rendered body');
  assert.ok(seen[0].file.endsWith('drain-cleaning-cost-springfield.md'), 'and the path it would have used');
  assert.equal(seen[0].cover.source, 'curated-fallback');
});

test('persistPost returning true dual-writes (migration mode)', async () => {
  configureTestEngine({}, {
    generateText: async () => JSON.stringify(validPost()),
    persistPost: async () => true,
  });
  const root = emptyRoot();
  await generateBlogRun(root, { count: 1, dryRun: false, skipPing: true });
  assert.ok(existsSync(join(root, 'src/content/blog/drain-cleaning-cost-springfield.md')));
});

test('refresh routes through persistPost with isRefresh true', async () => {
  const seen: PersistPostArgs[] = [];
  configureTestEngine({}, {
    generateText: async () => JSON.stringify(validPost()),
    persistPost: async (args) => { seen.push(args); },
  });
  const root = emptyRoot();
  const file = join(root, 'src/content/blog/drain-cleaning-cost-springfield.md');
  writeFileSync(file, '---\ntitle: "Old"\ndate: 2026-01-01\n---\n' + Array(320).fill('w').join(' '));
  const before = readFileSync(file, 'utf8');
  await refreshBlogPost(root, 'drain-cleaning-cost-springfield', {});
  assert.equal(seen.length, 1);
  assert.equal(seen[0].isRefresh, true);
  assert.equal(readFileSync(file, 'utf8'), before, 'hook owned persistence, file untouched');
});

// ---------- GAP 2: configurable content extensions ----------

test('an .mdx corpus is visible to the readers and the cadence guard', () => {
  const rt = configureTestEngine();
  rt.config.paths.contentExtensions = ['.mdx', '.md'];
  assert.deepEqual(contentExtensions(), ['.mdx', '.md']);
  assert.equal(isPostFile('post.mdx'), true);
  assert.equal(isPostFile('post.md'), true);
  assert.equal(isPostFile('_draft.mdx'), false);
  assert.equal(isPostFile('notes.txt'), false);
  assert.equal(slugFromFile('deep-dive.mdx'), 'deep-dive');

  const root = emptyRoot();
  writeFileSync(join(root, 'src/content/blog/mdx-post.mdx'), '---\ntitle: "MDX Post"\ndate: 2026-08-01\n---\nBody');
  writeFileSync(join(root, 'src/content/blog/md-post.md'), '---\ntitle: "MD Post"\ndate: 2026-08-02\n---\nBody');
  const existing = readExistingPosts(root);
  assert.deepEqual(existing.map((p) => p.slug).sort(), ['md-post', 'mdx-post']);
  assert.equal(existing.find((p) => p.slug === 'mdx-post')!.date, '2026-08-01');
  const parsed = readGeneratedBlogPosts({ root, fallback: { description: 'd', author: 'a', heroImage: '/h', heroImageAltPrefix: 'x' } });
  assert.deepEqual(parsed.map((p) => p.title).sort(), ['MD Post', 'MDX Post']);
});

test('generation writes the first configured extension; refresh finds an existing .mdx', async () => {
  const rt = configureTestEngine({}, { generateText: async () => JSON.stringify(validPost()) });
  rt.config.paths.contentExtensions = ['.mdx'];
  const root = emptyRoot();
  await generateBlogRun(root, { count: 1, dryRun: false, skipPing: true });
  assert.ok(existsSync(join(root, 'src/content/blog/drain-cleaning-cost-springfield.mdx')));
  assert.equal(existsSync(join(root, 'src/content/blog/drain-cleaning-cost-springfield.md')), false);

  const { file } = await refreshBlogPost(root, 'drain-cleaning-cost-springfield', { dryRun: true });
  assert.ok(file.endsWith('.mdx'), 'refresh resolved the .mdx file');
});

test('default extension list is unchanged for existing adapters', () => {
  configureTestEngine();
  assert.deepEqual(contentExtensions(), ['.md']);
  assert.equal(isPostFile('a.mdx'), false);
});

// ---------- GAP 3: OG card degrades without a usable raster logo ----------

async function ogWith(logo: 'png' | 'svg' | 'none'): Promise<{ width?: number; height?: number; format?: string }> {
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-og-'));
  mkdirSync(join(root, 'public'), { recursive: true });
  if (logo === 'png') await sharp({ create: { width: 320, height: 112, channels: 4, background: { r: 9, g: 9, b: 9, alpha: 1 } } }).png().toFile(join(root, 'public/logo.png'));
  if (logo === 'svg') writeFileSync(join(root, 'public/logo.png'), '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="112"><rect width="320" height="112" fill="#c33"/></svg>');
  await makeOgCard(root, validPost(), false);
  return sharp(join(root, 'public/assets/blog/drain-cleaning-cost-springfield.jpg')).metadata();
}

test('OG card renders with a PNG logo, an SVG mark, or no logo at all', async () => {
  for (const logo of ['png', 'svg', 'none'] as const) {
    const meta = await ogWith(logo);
    assert.equal(meta.format, 'jpeg', `${logo}: format`);
    assert.equal(meta.width, 1200, `${logo}: width`);
    assert.equal(meta.height, 630, `${logo}: height`);
  }
});
