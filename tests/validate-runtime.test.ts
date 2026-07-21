/**
 * Adoption guardrails. Each case here is a mistake a first-time adapter actually makes, and the
 * point of the assertion is that it is caught AT CONFIG TIME with a message naming the field —
 * not deep in the image pipeline, and never after a paid model call.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configureBlogEngine } from '../src/config.js';
import { BlogEngineConfigError, validateBlogEngineRuntime } from '../src/validate-runtime.js';
import { testConfig } from './helpers.js';
import type { BlogEngineRuntime, BlogEngineTopics } from '../src/types.js';

const topics = (overrides: Partial<BlogEngineTopics> = {}): BlogEngineTopics => ({
  allowedCategories: ['Guides'],
  crossPromoEvery: 4,
  gradients: ['g1'],
  heroPhotos: [{ url: '/x.jpg', alt: 'x' }],
  internalLinks: ['/', '/blog'],
  editorial: [{ keyword: 'winter pipe care', category: 'Guides', angle: 'prevention' }],
  crossPromo: [],
  ...overrides,
});

const runtime = (overrides: Partial<BlogEngineRuntime> = {}): BlogEngineRuntime => ({
  config: testConfig(),
  topics: topics(),
  brandPersona: () => 'persona',
  ...overrides,
});

test('a complete runtime reports no problems', () => {
  assert.deepEqual(validateBlogEngineRuntime(runtime()), []);
});

test('empty topic arrays are caught by name instead of crashing later', () => {
  // Each of these is indexed modulo its own length somewhere in the pipeline.
  for (const [key, field] of [
    ['allowedCategories', 'topics.allowedCategories'],
    ['editorial', 'topics.editorial'],
    ['internalLinks', 'topics.internalLinks'],
    ['gradients', 'topics.gradients'],
    ['heroPhotos', 'topics.heroPhotos'],
  ] as const) {
    const problems = validateBlogEngineRuntime(runtime({ topics: topics({ [key]: [] } as Partial<BlogEngineTopics>) }));
    assert.ok(
      problems.some((p) => p.startsWith(field)),
      `empty ${key} should report a ${field} problem, got: ${problems.join(' | ')}`,
    );
  }
});

test('identity requires only name, urls and an agent name', () => {
  const base = testConfig();
  const minimal = {
    ...base,
    identity: {
      name: 'Fen & Field Bakery',
      siteUrl: 'https://fenandfield.example',
      siteHost: 'fenandfield.example',
      agent: { name: 'Fen & Field Bakery' },
    },
  };
  assert.deepEqual(validateBlogEngineRuntime(runtime({ config: minimal })), [], 'a minimal identity is valid');
});

test('malformed urls and paths are named precisely', () => {
  const base = testConfig();
  const bad = {
    ...base,
    identity: { ...base.identity, siteUrl: 'fenandfield.example', siteHost: 'https://fenandfield.example', ctaPath: 'visit' },
  };
  const problems = validateBlogEngineRuntime(runtime({ config: bad }));
  assert.ok(problems.some((p) => p.startsWith('identity.siteUrl')), 'siteUrl must be absolute');
  assert.ok(problems.some((p) => p.startsWith('identity.siteHost')), 'siteHost must be bare');
  assert.ok(problems.some((p) => p.startsWith('identity.ctaPath')), 'ctaPath must be site-relative');
});

test('internal links must be site-relative', () => {
  const problems = validateBlogEngineRuntime(runtime({ topics: topics({ internalLinks: ['/', 'https://example.com/blog'] }) }));
  assert.ok(problems.some((p) => p.startsWith('topics.internalLinks')));
});

test('editorial categories outside allowedCategories are caught', () => {
  const problems = validateBlogEngineRuntime(
    runtime({ topics: topics({ editorial: [{ keyword: 'k', category: 'Nope', angle: 'a' }] }) }),
  );
  assert.ok(problems.some((p) => p.includes('allowedCategories')), problems.join(' | '));
});

test('cross-promo topics without a backlink are flagged', () => {
  const base = testConfig();
  const noBacklink = { ...base, identity: { ...base.identity, backlink: undefined } };
  const problems = validateBlogEngineRuntime(
    runtime({ config: noBacklink, topics: topics({ crossPromo: [{ keyword: 'k', angle: 'a' }] }) }),
  );
  assert.ok(problems.some((p) => p.startsWith('topics.crossPromo')));
});

test('configureBlogEngine throws one readable error listing every problem', () => {
  const broken = runtime({ topics: topics({ allowedCategories: [], internalLinks: [] }) });
  assert.throws(
    () => configureBlogEngine(broken),
    (err: unknown) => {
      assert.ok(err instanceof BlogEngineConfigError);
      assert.ok(err.problems.length >= 2, 'reports every problem at once, not just the first');
      assert.match(err.message, /docs\/ADOPTION\.md/, 'points the adopter at the guide');
      return true;
    },
  );
});

test('validation can be opted out of for tooling', () => {
  assert.doesNotThrow(() => configureBlogEngine(runtime({ topics: topics({ allowedCategories: [] }) }), { validate: false }));
});

test('the shipped example adapters are themselves valid', async () => {
  // Documentation that is executed cannot rot. If either example stops satisfying the contract,
  // this fails rather than misleading the next adopter who copies it.
  const { minimalBlogRuntime } = await import('../examples/minimal/runtime.js');
  assert.deepEqual(validateBlogEngineRuntime(minimalBlogRuntime()), [], 'examples/minimal must be a valid adapter');

  const { sdbgBlogRuntime } = await import('../examples/sdbg/runtime.js');
  assert.deepEqual(validateBlogEngineRuntime(sdbgBlogRuntime()), [], 'examples/sdbg must be a valid adapter');
});
