import { BLOG_CONFIG, getBlogTopics } from './config.js';
import { readGeneratedBlogPosts } from './content-reader.js';
import { contentRules } from './generate-post.js';
import type { CorpusAuditEntry, CorpusVerdict, ParsedBlogPost } from './types.js';
import { wordCount } from './utils.js';

/**
 * Corpus audit — the ASEO skill's blog verdicts applied to every published post:
 *   SHIP  distinct, useful, structurally complete, current
 *   FIX   recoverable gaps (thin answer block, missing dims/author/tags, stale, weak FAQs…)
 *   BLOCK unsafe or unusable (blocked claim phrases, near-empty body, missing title)
 * Pure and offline: reads the Markdown, applies the same contract the generator enforces.
 */
export interface AuditOptions {
  blogDir?: string;
  /** Days after which an un-refreshed post is flagged FIX:stale (default 365). */
  staleAfterDays?: number;
  now?: Date;
}

function questionH2s(content: string): number {
  return (content.match(/^##\s+[^\n]*\?\s*$/gm) || []).length;
}
function h2s(content: string): number {
  return (content.match(/^##\s/gm) || []).length;
}
function blockquoteWords(content: string): number {
  const lines = content.split('\n').filter((l) => /^>\s?/.test(l));
  return wordCount(lines.map((l) => l.replace(/^>\s?/, '')).join(' '));
}

export function auditPost(
  post: ParsedBlogPost,
  context: { allSlugs: Set<string>; altCounts: Map<string, number>; now: Date; staleAfterDays: number },
): CorpusAuditEntry {
  const rules = contentRules();
  const internal = new Set<string>([...getBlogTopics().internalLinks, ...[...context.allSlugs].map((s) => `/blog/${s}`)]);
  const fix: string[] = [];
  const block: string[] = [];

  if (!post.title) block.push('missing title');
  const bodyWords = wordCount(post.content);
  if (bodyWords < 300) block.push(`body under 300 words (${bodyWords})`);
  else if (bodyWords < rules.minBodyWords) fix.push(`body under ${rules.minBodyWords} words (${bodyWords})`);

  const hay = [post.title, post.description, post.answer, post.content, ...post.faqs.flatMap((f) => [f.question, f.answer])].join('\n').toLowerCase();
  const blocked = rules.blockedPhrases.filter((p) => hay.includes(p.toLowerCase()));
  if (blocked.length) block.push('blocked claim phrases: ' + blocked.join(', '));

  if (post.description.length < 70 || post.description.length > 170) fix.push(`description ${post.description.length} chars (aim 120-158)`);
  if (post.title.length > 70) fix.push(`title ${post.title.length} chars (aim <= 65)`);
  const aw = wordCount(post.answer);
  if (aw < 30 || aw > 70 || post.answer === post.description) fix.push(`quick answer ${aw} words / missing (aim 40-55, distinct from description)`);
  if (h2s(post.content) < 3) fix.push('fewer than 3 H2 sections');
  if (rules.minQuestionH2s && questionH2s(post.content) < rules.minQuestionH2s) fix.push(`fewer than ${rules.minQuestionH2s} question-phrased H2s`);
  if (rules.requireCitableBlockquote && blockquoteWords(post.content) < 50) fix.push('no citable blockquote (>= 50 words)');
  if (post.faqs.length < 3) fix.push(`only ${post.faqs.length} FAQs (aim 3)`);
  if (post.tags.length < 2) fix.push('fewer than 2 tags');
  if (!post.author) fix.push('no author (E-E-A-T)');
  if (!post.heroImage) fix.push('no hero image');
  else {
    if (!post.heroImageAlt) fix.push('no hero alt text');
    else if ((context.altCounts.get(post.heroImageAlt) || 0) > 1) fix.push('hero alt duplicated across posts');
    if (/^https?:\/\//.test(post.heroImage) && !post.heroImage.startsWith(BLOG_CONFIG.identity.siteUrl)) fix.push('hero is hotlinked (not local)');
    if (!post.heroImageWidth || !post.heroImageHeight) fix.push('no image dimensions (CLS)');
  }
  const links = [...post.content.matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1].split('#')[0].split('?')[0]);
  const bad = links.filter((p) => p !== '/' && !internal.has(p));
  if (bad.length) fix.push('links to unknown internal paths: ' + [...new Set(bad)].join(', '));
  if (!links.some((p) => internal.has(p))) fix.push('no internal links');
  const updated = Date.parse(post.updatedAt || post.publishedAt);
  if (!Number.isNaN(updated)) {
    const ageDays = (context.now.getTime() - updated) / 864e5;
    if (ageDays > context.staleAfterDays) fix.push(`stale: last updated ${Math.round(ageDays)} days ago`);
    if (ageDays < -1) fix.push('date is in the future');
  } else fix.push('unparseable date');

  const verdict: CorpusVerdict = block.length ? 'BLOCK' : fix.length ? 'FIX' : 'SHIP';
  return { slug: post.slug, verdict, issues: [...block, ...fix] };
}

export function auditBlogCorpus(root: string, options: AuditOptions = {}): CorpusAuditEntry[] {
  const posts = readGeneratedBlogPosts({
    root,
    blogDir: options.blogDir || BLOG_CONFIG.paths.blogDir,
    fallback: { description: '', author: '', heroImage: '', heroImageAltPrefix: BLOG_CONFIG.identity.name },
  });
  const altCounts = new Map<string, number>();
  for (const p of posts) altCounts.set(p.heroImageAlt, (altCounts.get(p.heroImageAlt) || 0) + 1);
  const context = {
    allSlugs: new Set(posts.map((p) => p.slug)),
    altCounts,
    now: options.now || new Date(),
    staleAfterDays: options.staleAfterDays ?? 365,
  };
  return posts.map((p) => auditPost(p, context)).sort((a, b) => (a.verdict === b.verdict ? a.slug.localeCompare(b.slug) : a.verdict === 'BLOCK' ? -1 : b.verdict === 'BLOCK' ? 1 : a.verdict === 'FIX' ? -1 : 1));
}

export function formatAuditReport(entries: readonly CorpusAuditEntry[]): string {
  const counts = { SHIP: 0, FIX: 0, BLOCK: 0 };
  for (const e of entries) counts[e.verdict]++;
  const lines = [`Corpus audit: ${entries.length} posts — SHIP ${counts.SHIP} · FIX ${counts.FIX} · BLOCK ${counts.BLOCK}`, ''];
  for (const e of entries) {
    if (e.verdict === 'SHIP') continue;
    lines.push(`${e.verdict}  ${e.slug}`);
    for (const issue of e.issues) lines.push(`      - ${issue}`);
  }
  return lines.join('\n');
}
