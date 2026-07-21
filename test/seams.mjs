/**
 * Offline verification of the three provider seams + backward compatibility.
 * Run: npm test   (no network, no API keys, no file writes — dryRun throughout)
 */
import { configureBlogEngine, generateBlogRun, getGscQueries, pingGscSitemap } from '../dist/src/index.js';

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
};

const baseConfig = (ogEnabled) => ({
  identity: {
    name: 'Test Site', siteUrl: 'https://example.com', siteHost: 'example.com',
    agent: { name: 'Agent', title: 'agent', titleCap: 'Agent', license: 'XX' },
    areas: ['Area'], voice: { name: 'Voice', homeCtaPath: '/' },
    backlink: { url: 'https://bizrnr.com', deepLink: 'https://bizrnr.com/x' },
  },
  paths: { blogDir: 'tmp-content', assetDir: 'tmp-assets', heroDir: 'tmp-heroes', brandLogo: 'x.png', watermarkLogo: 'x.png' },
  gsc: { property: 'sc-domain:example.com', sitemap: 'https://example.com/sitemap.xml' },
  indexNow: { key: 'k' },
  text: { provider: 'openrouter', url: 'https://x', model: 'm', maxTokens: 100, temperature: 0.7 },
  image: {
    model: 'm', size: '1536x1024', quality: 'high', format: 'webp', credit: 'c',
    promptMarket: 'm', promptStyle: 's', promptCamera: 'c',
    watermark: { width: 10, opacity: 0.8, margin: 4 },
    og: { ...(ogEnabled === undefined ? {} : { enabled: ogEnabled }), width: 1200, height: 630, colors: { bg: '#000', bg2: '#111', gold: '#fc0', gold2: '#fa0', text: '#fff', dim: '#888' }, titleFont: 'serif', uiFont: 'sans' },
  },
  rss: { title: 't', description: 'd', path: '/blog/feed.xml', limit: 10 },
  logPrefix: '[test]',
});

const topics = {
  allowedCategories: ['Guides'], crossPromoEvery: 99, gradients: ['g1'],
  heroPhotos: [{ url: '/fallback.jpg', alt: 'fallback' }],
  internalLinks: ['/', '/blog'],
  editorial: [{ keyword: 'editorial fallback topic', category: 'Guides', angle: 'angle' }],
  crossPromo: [],
};

const POST_JSON = JSON.stringify({
  title: 'How Much Does A Test Cost In Testville?',
  slug: 'how-much-does-a-test-cost',
  description: 'A clear guide to what a test costs in Testville, what drives the price, and how to compare quotes before you commit to anything at all.',
  category: 'Guides',
  answer: 'A test in Testville typically costs a moderate amount, depending on scope, materials and access. Compare at least three written quotes, confirm what each includes, and ask how change orders are handled before signing anything.',
  readMins: 6,
  tags: ['testville', 'costs', 'guides'],
  heroImageAlt: 'A test bench in Testville',
  faqs: [
    { q: 'What does a test cost?', a: 'It varies with scope and access. Get three written quotes so you can compare like for like, and confirm what each one includes.' },
    { q: 'How long does a test take?', a: 'Most take a short while. Timing depends on scheduling and the size of the job, so ask for a written schedule up front.' },
    { q: 'Do I need a permit?', a: 'Sometimes. Check with your local authority before work begins, and confirm in writing who is responsible for pulling it.' },
  ],
  body: [
    'A short answer-first lede that resolves the core question immediately for the reader.',
    '',
    '## How much does a test cost in Testville?',
    'A test in Testville generally costs a moderate amount for a standard scope. The final number depends on access, materials and how much preparation is needed before the work starts. Ask each provider to itemise their quote so you can compare like for like rather than guessing at what is included.',
    '',
    '## What drives the price up or down?',
    'Scope is the biggest driver, followed by access and materials. A straightforward job in an easy location sits at the lower end, while anything requiring extra preparation, specialist equipment or out-of-hours work moves toward the upper end of the range. Preparation is the line item people most often forget: clearing the area, protecting adjacent surfaces and disposing of what comes out all take time, and time is the largest share of most quotes. If two quotes differ sharply, the gap is usually preparation or disposal rather than the headline work itself, so read those lines carefully before deciding which offer is genuinely cheaper.',
    '',
    '## What should be included in a written quote?',
    'A written quote should name the scope, the materials, the schedule, the payment stages and the warranty. Vague quotes are difficult to compare and are the most common source of later disagreement, because nobody wrote down what was assumed. Ask for the exclusions in writing as well as the inclusions; knowing what is not covered tells you more about a quote than the total does. A provider who is comfortable putting all of that on paper is usually the one who has thought the job through, and that thinking is what you are actually paying for.',
    '',
    '> As of January 2026, a test in Testville is quoted per scope rather than per hour, and prices vary with access, materials and preparation. Comparing three written, itemised quotes remains the most reliable way to establish a fair price, because each quote makes explicit what is and is not included. Confirm in writing who is responsible for permits and how change orders are priced before any work begins.',
    '',
    '## How do you compare quotes fairly?',
    'Put the quotes side by side and check that each covers the same scope before you look at any totals. Normalise them first: if one includes disposal and another does not, add disposal to the second before comparing. Then weigh the things a number cannot show you, such as how promptly each provider replied, how clearly they explained the trade-offs, and whether they were willing to put their assumptions in writing. The cheapest quote is only the best value when it covers the same work as the others. Read more on the [blog](/blog) and start from the [home page](/) when you are ready to talk it through with someone.',
    '',
    'Ready to get started? Speak with Voice today.',
  ].join('\n'),
});

/* ---------------------------------------------- 1. all three seams engaged --- */
console.log('\nSEAMS ENGAGED (hooks supplied, og card disabled)');
let renderMarkdownCalled = false;
let submitSitemapCalled = false;

configureBlogEngine({
  config: baseConfig(false),
  topics,
  brandPersona: () => 'persona',
  hooks: {
    // Seam 1: our own Search Console source (a service account, in real life).
    fetchGscQueries: async ({ property, days }) => {
      check('fetchGscQueries receives property + window', property === 'sc-domain:example.com' && days === 28, `${property}/${days}d`);
      return [
        { query: 'singleword', impressions: 900 },              // 1 word -> filtered out
        { query: 'example site thing', impressions: 800 },      // brand term -> filtered out
        { query: 'test cost in testville', impressions: 50 },
        { query: 'lower volume query here', impressions: 5 },
      ];
    },
    submitSitemap: async ({ sitemap }) => { submitSitemapCalled = sitemap; },
    generateText: async () => POST_JSON,
    generateHeroImage: async () => null, // -> curated fallback, no sharp/network needed
    // Seam 2: our own frontmatter shape.
    renderMarkdown: ({ post, cover, dateISO }) => {
      renderMarkdownCalled = true;
      return `---\nCUSTOM_SHAPE: true\ntitle: "${post.title}"\ndate: "${dateISO}"\nogImage: "${cover.ogImage}"\naudience: "homeowner"\n---\n\n${post.body}\n`;
    },
  },
});

const { queries } = await getGscQueries();
check('hook queries pass through engine filters (1-word + brand dropped)', queries.length === 2, `kept ${queries.map((q) => q.query).join(' | ')}`);
check('hook queries sorted by impressions', queries[0]?.query === 'test cost in testville');

await pingGscSitemap(null);
check('submitSitemap hook invoked without an OAuth token', submitSitemapCalled === 'https://example.com/sitemap.xml');

const logs = [];
const realLog = console.log;
console.log = (...a) => logs.push(a.join(' '));
await generateBlogRun(process.cwd(), { count: 1, dryRun: true, skipPing: true });
console.log = realLog;
const out = logs.join('\n');

check('renderMarkdown hook used for the file body', renderMarkdownCalled);
check('custom frontmatter shape emitted', out.includes('CUSTOM_SHAPE: true'));
check('engine default frontmatter NOT emitted', !out.includes('gradient:') && !out.includes('feature: false'));
check('topic came from the GSC hook', out.includes('test cost in testville'), 'gsc-sourced topic selected');
check('og card disabled -> ogImage falls back to the hero', out.includes('ogImage: "/fallback.jpg"'));

/* ------------------------------------------------- 2. backward compatibility --- */
// Only the PRE-EXISTING v0.2.0 hooks are supplied (generateText/generateHeroImage), so the model
// call can run offline. None of the NEW seams are provided and `og.enabled` is absent — this is
// exactly what an existing adopter (SDBG, the template sites) looks like after this change.
console.log('\nBACKWARD COMPATIBILITY (new seams absent, og card left at default)');
configureBlogEngine({
  config: baseConfig(undefined),
  topics,
  brandPersona: () => 'persona',
  hooks: { generateText: async () => POST_JSON, generateHeroImage: async () => null },
});

const legacy = await getGscQueries();
check('no hook + no OAuth env -> empty candidates, no throw', legacy.token === null && legacy.queries.length === 0);

let threw = false;
try { await pingGscSitemap(null); } catch { threw = true; }
check('pingGscSitemap(null) still a silent no-op', !threw);

const logs2 = [];
console.log = (...a) => logs2.push(a.join(' '));
await generateBlogRun(process.cwd(), { count: 1, dryRun: true, skipPing: true }).catch(() => {});
console.log = realLog;
const out2 = logs2.join('\n');
check('default path still emits the engine frontmatter', out2.includes('gradient:') && out2.includes('feature: false'));
check('default path still writes an og card path', /ogImage: "\/tmp-assets\//.test(out2));
check('editorial fallback used when no GSC source', out2.includes('editorial fallback topic'));

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
