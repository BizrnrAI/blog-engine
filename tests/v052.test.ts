import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';
import { auditBlogCorpus } from '../src/audit.js';
import { parseBlogFrontmatter, parsePostFile, readGeneratedBlogPosts } from '../src/content-reader.js';
import { readExistingPosts } from '../src/existing-posts.js';
import { DEFAULT_FRONTMATTER_ALIASES, coerceFrontmatterValue, normalizeFrontmatter } from '../src/frontmatter.js';
import { normalizeGeneratedPost, parseModelJson, repairJsonStringNewlines, validateGeneratedPost } from '../src/generate-post.js';
import { generateBlogRun } from '../src/publisher.js';
import { refreshBlogPost } from '../src/refresh.js';
import { allEditorialTopicsCovered, pickTopic, resolveTopic } from '../src/topic-rotation.js';
import type { EditorialTopic, SeoTopic } from '../src/types.js';
import { configureTestEngine, validPost } from './helpers.js';

const FENCE = '`'.repeat(3);

/** A post in kristianpeter.com's shape: pubDate/updatedDate/cover/coverAlt/readingTime/autopilot. */
function kpPost(slug: string, body = Array(600).fill('word').join(' ')): string {
  return [
    '---',
    'title: "When Not to Automate"',
    'description: "A field guide to the work that should stay human, and the signals that tell you which is which today."',
    'pubDate: 2026-07-01',
    'updatedDate: 2026-08-20',
    'tags: [automation, operations]',
    'readingTime: "7 min"',
    'cover: "/images/log/when-not-to-automate.webp"',
    'coverAlt: "Kristian Peter – a quiet operations desk at dusk"',
    'autopilot: true',
    '---',
    '',
    body,
  ].join('\n');
}

function rootWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'blog-engine-v052-'));
  mkdirSync(join(root, 'src/content/blog'), { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, 'src/content/blog', name), content);
  return root;
}

function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
}

beforeEach(() => {
  configureTestEngine();
});

// ---------------- frontmatter aliases ----------------

test('normalizeFrontmatter maps the default aliases and coerces readingTime/dates', () => {
  const out = normalizeFrontmatter({
    pubDate: '2026-07-01T12:00:00-07:00',
    updatedDate: '2026-08-20',
    cover: '/images/log/x.webp',
    coverAlt: 'scene',
    readingTime: '7 min',
    autopilot: 'true',
  });
  assert.equal(out.date, '2026-07-01');
  assert.equal(out.updated, '2026-08-20');
  assert.equal(out.image, '/images/log/x.webp');
  assert.equal(out.imageAlt, 'scene');
  assert.equal(out.readMins, '7');
  assert.equal(out.autopilot, 'true', 'unknown keys are preserved');
  assert.equal(out.pubDate, '2026-07-01T12:00:00-07:00', 'original keys are preserved');
});

test('canonical keys always win over an alias', () => {
  const out = normalizeFrontmatter({ date: '2026-01-01', pubDate: '2020-01-01', image: '/a.webp', cover: '/b.webp' });
  assert.equal(out.date, '2026-01-01');
  assert.equal(out.image, '/a.webp');
});

test('coerceFrontmatterValue only touches keys it understands', () => {
  assert.equal(coerceFrontmatterValue('readMins', '7 min'), '7');
  assert.equal(coerceFrontmatterValue('readMins', 'quick read'), 'quick read');
  assert.equal(coerceFrontmatterValue('date', '2026-07-01T12:00:00-07:00'), '2026-07-01');
  assert.equal(coerceFrontmatterValue('title', 'A 7 min read'), 'A 7 min read');
  assert.ok(DEFAULT_FRONTMATTER_ALIASES.pubDate === 'date' && DEFAULT_FRONTMATTER_ALIASES.readingTime === 'readMins');
});

test('parseBlogFrontmatter normalizes by default and can be opted out', () => {
  const raw = kpPost('x');
  assert.equal(parseBlogFrontmatter(raw).frontmatter.image, '/images/log/when-not-to-automate.webp');
  const literal = parseBlogFrontmatter(raw, { normalize: false }).frontmatter;
  assert.equal(literal.image, undefined);
  assert.equal(literal.cover, '/images/log/when-not-to-automate.webp');
});

test('paths.frontmatterAliases adds site-specific keys on top of the defaults', () => {
  const rt = configureTestEngine();
  rt.config.paths.frontmatterAliases = { summary: 'description' };
  const { frontmatter } = parseBlogFrontmatter('---\ntitle: "T"\nsummary: "From the summary key"\npubDate: 2026-05-05\n---\nBody');
  assert.equal(frontmatter.description, 'From the summary key');
  assert.equal(frontmatter.date, '2026-05-05', 'defaults still apply');
});

test('hooks.parseFrontmatter overrides the parser; returning null falls back', () => {
  configureTestEngine({}, {
    parseFrontmatter: ({ raw, slug }) =>
      raw.includes('use-the-hook') ? { frontmatter: { title: `Hooked ${slug}`, pubDate: '2026-02-02' }, content: 'hook body', faqs: [], tags: ['hooked'] } : null,
  });
  const hooked = parsePostFile('use-the-hook', 'a');
  assert.equal(hooked.frontmatter.title, 'Hooked a');
  assert.equal(hooked.frontmatter.date, '2026-02-02', 'hook output is alias-normalized too');
  assert.equal(hooked.tags[0], 'hooked');
  assert.equal(parsePostFile(kpPost('b'), 'b').frontmatter.image, '/images/log/when-not-to-automate.webp');
});

test('readGeneratedBlogPosts understands a site-shaped post end to end', () => {
  const root = rootWith({ 'when-not-to-automate.md': kpPost('when-not-to-automate') });
  const [post] = readGeneratedBlogPosts({ root, fallback: { description: 'fallback', author: 'Fallback', heroImage: '/fallback.jpg', heroImageAltPrefix: 'KP' } });
  assert.equal(post.publishedAt, '2026-07-01');
  assert.equal(post.updatedAt, '2026-08-20');
  assert.equal(post.heroImage, '/images/log/when-not-to-automate.webp');
  assert.equal(post.heroImageAlt, 'Kristian Peter – a quiet operations desk at dusk');
  assert.equal(post.readMins, 7);
});

test('readExistingPosts exposes pubDate for website-owned publishing policies', async () => {
  const root = rootWith({
    'a.md': kpPost('a').replace('pubDate: 2026-07-01', `pubDate: ${iso(1)}`),
    'b.md': kpPost('b').replace('pubDate: 2026-07-01', `pubDate: ${iso(2)}`),
  });
  const existing = readExistingPosts(root);
  assert.deepEqual(existing.map((p) => p.date).sort(), [iso(2), iso(1)].sort());
  assert.equal(existing[0].title, 'When Not to Automate');


});

test('corpus audit no longer reports a site-shaped post as image-less or date-less', () => {
  const root = rootWith({ 'when-not-to-automate.md': kpPost('when-not-to-automate') });
  const [entry] = auditBlogCorpus(root, { now: new Date('2026-08-22') });
  assert.ok(!entry.issues.some((i) => i.includes('no hero image')), entry.issues.join('; '));
  assert.ok(!entry.issues.some((i) => i.includes('stale') || i.includes('unparseable date')), entry.issues.join('; '));
});

test('refreshBlogPost carries a site-shaped cover and publish date through', async () => {
  configureTestEngine({}, { generateText: async () => JSON.stringify(validPost()) });
  const root = rootWith({ 'when-not-to-automate.md': kpPost('when-not-to-automate') });
  const { markdown } = await refreshBlogPost(root, 'when-not-to-automate', { dryRun: true });
  assert.ok(markdown.includes('image: "/images/log/when-not-to-automate.webp"'), 'cover survived the refresh');
  assert.ok(markdown.includes('imageAlt: "Kristian Peter – a quiet operations desk at dusk"'));
  assert.ok(markdown.includes('date: 2026-07-01'), 'pubDate became the preserved publish date');
  assert.ok(markdown.includes(`updated: ${new Date().toISOString().slice(0, 10)}`));
});

// ---------------- topic pinning + derivation ----------------

const curated: EditorialTopic[] = [
  { keyword: 'when to automate', category: 'Guides', angle: 'judgement', slug: 'when-not-to-automate', title: 'When Not to Automate' },
  { keyword: 'speed to lead', category: 'Guides', angle: 'response time', slug: 'speed-to-lead-why-minutes-matter', title: 'Speed to Lead: Why Minutes Matter' },
];

test('curated topics use exact coverage, so a question-style title cannot false-positive', () => {
  const rt = configureTestEngine();
  // A published post that merely shares two distinctive words with the catalog entry.
  const existing = [{ slug: 'when-should-i-automate-follow-up', title: 'When should I automate my follow-up?' }];
  const setCatalog = (topics: EditorialTopic[]) => { (rt.topics as unknown as { editorial: EditorialTopic[] }).editorial = topics; };

  // Without pins, the two-distinctive-words heuristic reports this entry as already covered...
  setCatalog([{ keyword: curated[0].keyword, category: curated[0].category, angle: curated[0].angle }]);
  assert.equal(allEditorialTopicsCovered(existing), true, 'heuristic false-positive');

  // ...while a curated slug/title is matched exactly, so the entry stays selectable and gets picked.
  setCatalog([curated[0]]);
  assert.equal(allEditorialTopicsCovered(existing), false);
  const picked = pickTopic(existing, [], 0);
  assert.equal(picked.slug, 'when-not-to-automate');
  assert.equal(picked.title, 'When Not to Automate');

  setCatalog(curated);
  assert.equal(allEditorialTopicsCovered(existing), false);
  assert.equal(
    allEditorialTopicsCovered([
      { slug: 'when-not-to-automate', title: 'When Not to Automate' },
      { slug: 'speed-to-lead-why-minutes-matter', title: 'x' },
    ]),
    true,
  );
});

test('hooks.pickTopic wins, and returning null falls back to the engine rotation', async () => {
  const pinned: SeoTopic = { type: 'editorial', keyword: 'k', category: 'Guides', angle: 'a', mustBacklink: false, slug: 'my-exact-slug', title: 'My Exact Title' };
  configureTestEngine({}, { pickTopic: async () => pinned });
  assert.equal((await resolveTopic([], [], 0)).slug, 'my-exact-slug');
  configureTestEngine({}, { pickTopic: async () => null });
  assert.equal((await resolveTopic([], [], 0)).keyword, 'winter pipe care', 'falls back to the editorial pool');
});

test('hooks.deriveTopic fires only when every editorial topic is covered', async () => {
  let derived = 0;
  const rt = configureTestEngine({}, {
    deriveTopic: async () => { derived++; return { keyword: 'fresh topic', category: 'Guides', angle: 'new', slug: 'fresh-topic' }; },
  });
  (rt.topics as unknown as { editorial: EditorialTopic[] }).editorial = curated;
  const uncovered = await resolveTopic([{ slug: 'when-not-to-automate', title: 'When Not to Automate' }], [], 0);
  assert.equal(derived, 0);
  assert.equal(uncovered.slug, 'speed-to-lead-why-minutes-matter');
  const covered = await resolveTopic(curated.map((t) => ({ slug: t.slug!, title: t.title! })), [], 0);
  assert.equal(derived, 1);
  assert.equal(covered.slug, 'fresh-topic');
});

test('a pinned slug is used verbatim (no stop-word stripping) and a mismatch fails validation', () => {
  const topic: SeoTopic = { type: 'editorial', keyword: 'k', category: 'Guides', angle: 'a', mustBacklink: false, slug: 'when-not-to-automate', title: 'When Not to Automate' };
  assert.equal(
    normalizeGeneratedPost({ ...validPost(), slug: 'when not to automate', title: 'Something Else' }).slug,
    'when-not-automate',
    'unpinned: slugify drops the stop word "to"',
  );
  const pinnedPost = normalizeGeneratedPost({ ...validPost(), slug: 'model-invented-slug', title: 'Model Invented Title' }, topic);
  assert.equal(pinnedPost.slug, 'when-not-to-automate');
  assert.equal(pinnedPost.title, 'When Not to Automate');
  assert.deepEqual(validateGeneratedPost({ ...validPost(), slug: 'when-not-to-automate', title: 'When Not to Automate' }, { existingSlugs: [], topic }), []);
  const errs = validateGeneratedPost({ ...validPost(), slug: 'drifted-slug', title: 'Drifted Title' }, { existingSlugs: [], topic });
  assert.ok(errs.some((e) => e.includes('slug must be exactly "when-not-to-automate" (pinned)')));
  assert.ok(errs.some((e) => e.includes('title must be exactly "When Not to Automate" (pinned)')));
});

test('the prompt tells the model about pinned values', async () => {
  let prompt = '';
  const rt = configureTestEngine({}, {
    pickTopic: async () => ({ type: 'editorial', keyword: 'k', category: 'Guides', angle: 'a', mustBacklink: false, slug: 'pinned-slug-here', title: 'Pinned Title Here' }),
    generateText: async ({ messages }) => { prompt = messages.map((m) => m.content).join('\n'); return JSON.stringify(validPost()); },
  });
  assert.ok(rt.hooks?.pickTopic);
  await generateBlogRun(rootWith({}), { count: 1, dryRun: true, skipPing: true });
  assert.ok(prompt.includes('PINNED VALUES (exact match required):'));
  assert.ok(prompt.includes('"pinned-slug-here"') && prompt.includes('"Pinned Title Here"'));
});

// ---------------- model JSON parsing ----------------

test('parseModelJson survives fences, inner fences, preambles, and raw newlines', () => {
  assert.equal((parseModelJson('{"title":"A"}') as { title: string }).title, 'A');
  assert.equal((parseModelJson(`${FENCE}json\n{"title":"A"}\n${FENCE}`) as { title: string }).title, 'A');
  assert.equal((parseModelJson(`Sure!\n${FENCE}json\n{"title":"A"}\n${FENCE}\nHope that helps.`) as { title: string }).title, 'A');
  // The real KP failure: a fenced object whose body contains its own fences.
  const inner = parseModelJson(`${FENCE}json\n{"title":"A","body":"para\n\n${FENCE}sh\nls\n${FENCE}\nend"}\n${FENCE}`) as { body: string };
  assert.ok(inner.body.includes(`${FENCE}sh`) && inner.body.includes('end'));
  assert.equal((parseModelJson('{"title":"A","body":"line one\nline two"}') as { body: string }).body, 'line one\nline two');
  assert.equal((parseModelJson(`${FENCE}json\n{"title":"A"}`) as { title: string }).title, 'A', 'unterminated fence');
});

test('parseModelJson throws on non-JSON, and unwraps an array-wrapped object', () => {
  assert.throws(() => parseModelJson('I cannot help with that.'), /no JSON object found/);
  assert.throws(() => parseModelJson(''), /no JSON object found/);
  // A bare array is not a post, but the object inside one is exactly what the model meant to send.
  assert.equal((parseModelJson('[{"title":"A"}]') as { title: string }).title, 'A');
});

test('repairJsonStringNewlines only escapes inside string literals', () => {
  assert.equal(repairJsonStringNewlines('{\n  "a": "x\ny"\n}'), '{\n  "a": "x\\ny"\n}');
  assert.equal(repairJsonStringNewlines('{"a":"already \\n escaped"}'), '{"a":"already \\n escaped"}');
  assert.equal(repairJsonStringNewlines('{"a":"quote \\" then\nnewline"}'), '{"a":"quote \\" then\\nnewline"}');
});
