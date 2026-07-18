import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { markdownToAnswerSections, parseBlogFrontmatter } from '../src/content-reader.js';
import { toMarkdown } from '../src/markdown.js';
import { configureTestEngine, validPost } from './helpers.js';

beforeEach(() => {
  configureTestEngine();
});

function renderedMarkdown(): string {
  return toMarkdown(validPost(), {
    gradient: 'g1',
    cover: {
      image: '/assets/blog/generated/drain-cleaning-cost-springfield.webp',
      imageAlt: 'Acme Plumbing – plumber clearing a kitchen drain',
      ogImage: '/assets/blog/drain-cleaning-cost-springfield.jpg',
      source: 'ai-generated',
    },
    dateISO: '2026-07-18',
  });
}

test('toMarkdown output round-trips through parseBlogFrontmatter', () => {
  const { frontmatter, faqs, tags, content } = parseBlogFrontmatter(renderedMarkdown());
  assert.equal(frontmatter.title, 'How Much Does Drain Cleaning Cost in Springfield?');
  assert.equal(frontmatter.date, '2026-07-18');
  assert.equal(frontmatter.updated, '2026-07-18');
  assert.equal(frontmatter.image, '/assets/blog/generated/drain-cleaning-cost-springfield.webp');
  assert.deepEqual(tags, ['drain cleaning', 'pricing', 'springfield']);
  assert.equal(faqs.length, 3);
  assert.equal(faqs[0].question, 'How often should drains be cleaned?');
  assert.ok(content.includes('## What drives the price of drain cleaning?'));
});

test('parseBlogFrontmatter accepts inline tag arrays', () => {
  const { tags } = parseBlogFrontmatter('---\ntitle: "X"\ntags: [alpha, "beta"]\n---\nBody');
  assert.deepEqual(tags, ['alpha', 'beta']);
});

test('parseBlogFrontmatter handles files without frontmatter', () => {
  const parsed = parseBlogFrontmatter('Just some markdown.');
  assert.deepEqual(parsed.frontmatter, {});
  assert.equal(parsed.content, 'Just some markdown.');
});

test('markdownToAnswerSections splits H2 sections with answers', () => {
  const sections = markdownToAnswerSections('## First?\nFirst body here.\n\n## Second\nSecond body here.', 'Top answer.');
  assert.equal(sections.length, 2);
  assert.equal(sections[0].heading, 'First?');
  assert.equal(sections[0].answer, 'Top answer.');
  assert.equal(sections[1].answer, 'Second body here.');
});
