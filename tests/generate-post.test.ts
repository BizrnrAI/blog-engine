import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { normalizeGeneratedPost, parseModelJson, validateGeneratedPost } from '../src/generate-post.js';
import type { SeoTopic } from '../src/types.js';
import { configureTestEngine, validPost } from './helpers.js';

const topic: SeoTopic = {
  type: 'editorial',
  keyword: 'drain cleaning cost',
  category: 'Guides',
  angle: 'pricing transparency',
  mustBacklink: false,
};

beforeEach(() => {
  configureTestEngine();
});

test('parseModelJson tolerates fences and prose around the object', () => {
  const parsed = parseModelJson('Sure! Here is the JSON:\n```json\n{"title": "Hi"}\n```\nHope that helps.');
  assert.equal(parsed.title, 'Hi');
});

test('normalizeGeneratedPost clamps overlong descriptions instead of failing', () => {
  const longDescription = Array(60).fill('word').join(' ');
  const post = normalizeGeneratedPost({ ...validPost(), description: longDescription });
  assert.ok(post.description.length <= 158, `expected <= 158 chars, got ${post.description.length}`);
  assert.ok(!post.description.endsWith(' '), 'no trailing space');
});

test('normalizeGeneratedPost dedupes and lowercases tags', () => {
  const post = normalizeGeneratedPost({ ...validPost(), tags: ['Pricing', 'pricing', ' Drains '] });
  assert.deepEqual(post.tags, ['pricing', 'drains']);
});

test('a fully valid post passes validation', () => {
  const errs = validateGeneratedPost(validPost(), { existingSlugs: [], topic });
  assert.deepEqual(errs, []);
});

test('duplicate slug is rejected', () => {
  const errs = validateGeneratedPost(validPost(), { existingSlugs: ['drain-cleaning-cost-springfield'], topic });
  assert.ok(errs.some((e) => e.includes('slug already exists')));
});

test('missing question-phrased H2s is rejected', () => {
  const post = validPost();
  post.body = post.body.replace(/\?$/gm, '');
  const errs = validateGeneratedPost(post, { existingSlugs: [], topic });
  assert.ok(errs.some((e) => e.includes('question-phrased H2s')));
});

test('missing citable blockquote is rejected', () => {
  const post = validPost();
  post.body = post.body
    .split('\n')
    .filter((l) => !l.startsWith('> '))
    .join('\n');
  const errs = validateGeneratedPost(post, { existingSlugs: [], topic });
  assert.ok(errs.some((e) => e.includes('citable')));
});

test('links outside the allowed internal list are rejected', () => {
  const post = validPost();
  post.body += '\nSee our [secret page](/not-a-real-page).';
  const errs = validateGeneratedPost(post, { existingSlugs: [], topic });
  assert.ok(errs.some((e) => e.includes('non-existent internal paths')));
});

test('cross-promo posts must include the backlink host', () => {
  const errs = validateGeneratedPost(validPost(), { existingSlugs: [], topic: { ...topic, mustBacklink: true } });
  assert.ok(errs.some((e) => e.includes('bizrnr.com')));
});

test('blocked claim phrases are rejected when configured', () => {
  configureTestEngine({ content: { blockedPhrases: ['guaranteed savings'] } });
  const post = validPost();
  post.body += '\nWe promise guaranteed savings for everyone.';
  const errs = validateGeneratedPost(post, { existingSlugs: [], topic });
  assert.ok(errs.some((e) => e.includes('blocked claim phrases')));
});

test('content rules are configurable per site', () => {
  configureTestEngine({ content: { minQuestionH2s: 0, requireCitableBlockquote: false, minBodyWords: 400 } });
  const post = validPost();
  post.body = post.body
    .split('\n')
    .filter((l) => !l.startsWith('> '))
    .join('\n')
    .replace(/\?$/gm, '');
  const errs = validateGeneratedPost(post, { existingSlugs: [], topic });
  assert.deepEqual(errs, []);
});
