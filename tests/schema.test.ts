import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { blogPostGraph, blogPostingSchema, faqPageSchema } from '../src/schema.js';
import type { ParsedBlogPost } from '../src/types.js';
import { configureTestEngine } from './helpers.js';

beforeEach(() => {
  configureTestEngine();
});

const post: ParsedBlogPost = {
  slug: 'drain-cleaning-cost-springfield',
  title: 'How Much Does Drain Cleaning Cost in Springfield?',
  description: 'Pricing guide.',
  category: 'Guides',
  tags: ['drain cleaning', 'pricing'],
  author: 'Alex Acme',
  publishedAt: '2026-07-18',
  updatedAt: '2026-07-18',
  heroImage: '/assets/blog/generated/drain.webp',
  heroImageAlt: 'Plumber at work',
  ogImage: '/assets/blog/drain.jpg',
  readMins: 6,
  answer: 'It depends on access and severity.',
  content: 'Body',
  faqs: [{ question: 'How often?', answer: 'Annually.' }],
  body: [],
};

test('blogPostingSchema emits stable ids, dates, and absolute images', () => {
  const node = blogPostingSchema(post, {
    author: { id: 'https://acme-plumbing.example/#person', name: 'Alex Acme' },
    publisher: { name: 'Acme Plumbing', logo: '/logo.png' },
  });
  assert.equal(node['@id'], 'https://acme-plumbing.example/blog/drain-cleaning-cost-springfield#article');
  assert.equal(node.datePublished, '2026-07-18');
  assert.deepEqual(node.author, { '@id': 'https://acme-plumbing.example/#person' });
  assert.deepEqual(node.image, [
    'https://acme-plumbing.example/assets/blog/drain.jpg',
    'https://acme-plumbing.example/assets/blog/generated/drain.webp',
  ]);
  const publisher = node.publisher as Record<string, unknown>;
  assert.equal(publisher['@type'], 'Organization');
});

test('faqPageSchema maps questions to accepted answers', () => {
  const node = faqPageSchema('https://acme-plumbing.example/blog/x', post.faqs);
  const entity = (node.mainEntity as Array<Record<string, any>>)[0];
  assert.equal(entity.name, 'How often?');
  assert.equal(entity.acceptedAnswer.text, 'Annually.');
});

test('blogPostGraph bundles article, breadcrumbs, and faq into one graph', () => {
  const graph = blogPostGraph(post);
  assert.equal(graph['@context'], 'https://schema.org');
  const types = (graph['@graph'] as Array<Record<string, unknown>>).map((n) => n['@type']);
  assert.deepEqual(types, ['BlogPosting', 'BreadcrumbList', 'FAQPage']);
});

test('blogPostGraph omits FAQPage when the post has no faqs', () => {
  const graph = blogPostGraph({ ...post, faqs: [] });
  const types = (graph['@graph'] as Array<Record<string, unknown>>).map((n) => n['@type']);
  assert.deepEqual(types, ['BlogPosting', 'BreadcrumbList']);
});

test('schema builders work without a configured runtime when siteUrl is passed', () => {
  const node = blogPostingSchema(post, { siteUrl: 'https://standalone.example' });
  assert.equal(node.url, 'https://standalone.example/blog/drain-cleaning-cost-springfield');
});
