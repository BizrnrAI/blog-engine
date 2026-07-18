import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configureBlogEngine } from '../src/config.js';
import { validateGeneratedPost } from '../src/generate-post.js';
import { buildTemplateBlogEngineRuntime } from '../src/template-runtime.js';
import type { SeoTopic, TemplateSiteProfile } from '../src/types.js';
import { validPost } from './helpers.js';

const site: TemplateSiteProfile = {
  id: 'test-site',
  brand: 'Summit Service Co.',
  legalName: 'Summit Service Company',
  domain: 'https://summit.example',
  description: 'Template site.',
  industry: 'Professional services',
  primaryMarket: 'Springfield',
  region: 'CA',
  schemaType: 'ProfessionalService',
  theme: { ink: '#fff', muted: '#aaa', paper: '#000', surface: '#111', primary: '#0ff', accent: '#ff0' },
  hero: { image: '/assets/hero.svg' },
  services: [{ slug: 'drain-cleaning', title: 'Drain Cleaning', summary: 'Clear clogs fast.' }],
  markets: ['Springfield'],
  collections: [{ title: 'Kitchens', image: '/assets/kitchen.jpg', imageAlt: 'Kitchen sink' }],
  blogPosts: [],
  businessRunner: { agentName: 'BRI', poweredByUrl: 'https://bizrnr.com' },
};

test('template runtime builds a complete config from a site profile', () => {
  const runtime = buildTemplateBlogEngineRuntime(site);
  assert.equal(runtime.config.identity.siteHost, 'summit.example');
  assert.ok(runtime.topics.internalLinks.includes('/springfield/drain-cleaning'));
  assert.ok(runtime.topics.allowedCategories.includes('Service Guides'));
  assert.ok(runtime.brandPersona().includes('Summit Service Co.'));
});

test('template runtime validates an engine-shaped post end to end', () => {
  configureBlogEngine(buildTemplateBlogEngineRuntime(site));
  const topic: SeoTopic = { type: 'editorial', keyword: 'drain cleaning springfield', category: 'Service Guides', angle: 'pricing', mustBacklink: false };
  const post = { ...validPost(), category: 'Service Guides' };
  post.body = post.body
    .replace('(/services/drain-cleaning)', '(/springfield/drain-cleaning)')
    .replace('[speak with AVA](/)', '[speak with BRI](/)');
  const errs = validateGeneratedPost(post, { existingSlugs: [], topic });
  assert.deepEqual(errs, []);
});
