import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampText, mimeTypeFor, norm, slugify, wordCount, xmlEscape } from '../src/utils.js';

test('slugify strips stopwords and clamps length', () => {
  assert.equal(slugify('How to Sell Your Home in La Jolla'), 'sell-home-la-jolla');
  assert.ok(slugify('x'.repeat(200)).length <= 70);
});

test('clampText leaves short text unchanged', () => {
  assert.equal(clampText('Short and sweet.', 158), 'Short and sweet.');
});

test('clampText cuts on a word boundary without trailing punctuation', () => {
  const clamped = clampText('alpha bravo charlie delta echo foxtrot', 20);
  assert.equal(clamped, 'alpha bravo charlie');
});

test('clampText collapses internal whitespace', () => {
  assert.equal(clampText('a  b\n c', 158), 'a b c');
});

test('mimeTypeFor maps common extensions', () => {
  assert.equal(mimeTypeFor('/assets/blog/x.webp'), 'image/webp');
  assert.equal(mimeTypeFor('/assets/blog/x.jpg'), 'image/jpeg');
  assert.equal(mimeTypeFor('/assets/blog/x.PNG'), 'image/png');
  assert.equal(mimeTypeFor('/assets/blog/x.unknown'), 'image/jpeg');
});

test('xmlEscape escapes all five xml entities', () => {
  assert.equal(xmlEscape(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;');
});

test('norm and wordCount behave', () => {
  assert.equal(norm('Hello,  World!'), 'hello world');
  assert.equal(wordCount('one two  three\nfour'), 4);
});
