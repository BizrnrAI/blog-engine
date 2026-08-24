import { BLOG_CONFIG, blogBasePath, getBlogTopics } from './config.js';
import { readGeneratedBlogPosts } from './content-reader.js';
import { contentRules } from './generate-post.js';
import { wordCount } from './utils.js';
function questionH2s(content) {
    return (content.match(/^##\s+[^\n]*\?\s*$/gm) || []).length;
}
function h2s(content) {
    return (content.match(/^##\s/gm) || []).length;
}
function blockquoteWords(content) {
    const lines = content.split('\n').filter((l) => /^>\s?/.test(l));
    return wordCount(lines.map((l) => l.replace(/^>\s?/, '')).join(' '));
}
export function auditPost(post, context) {
    const rules = contentRules();
    const internal = new Set([...getBlogTopics().internalLinks, ...[...context.allSlugs].map((s) => `${blogBasePath()}/${s}`)]);
    const fix = [];
    const block = [];
    if (!post.title)
        block.push('missing title');
    const bodyWords = wordCount(post.content);
    if (bodyWords < 300)
        block.push(`body under 300 words (${bodyWords})`);
    else if (bodyWords < rules.minBodyWords)
        fix.push(`body under ${rules.minBodyWords} words (${bodyWords})`);
    const hay = [post.title, post.description, post.answer, post.content, ...post.faqs.flatMap((f) => [f.question, f.answer])].join('\n').toLowerCase();
    const blocked = rules.blockedPhrases.filter((p) => hay.includes(p.toLowerCase()));
    if (blocked.length)
        block.push('blocked claim phrases: ' + blocked.join(', '));
    if (post.description.length < 70 || post.description.length > 170)
        fix.push(`description ${post.description.length} chars (aim 120-158)`);
    if (post.title.length > 70)
        fix.push(`title ${post.title.length} chars (aim <= 65)`);
    const aw = wordCount(post.answer);
    if (aw < 30 || aw > 70 || post.answer === post.description)
        fix.push(`quick answer ${aw} words / missing (aim 40-55, distinct from description)`);
    if (h2s(post.content) < 3)
        fix.push('fewer than 3 H2 sections');
    if (rules.minQuestionH2s && questionH2s(post.content) < rules.minQuestionH2s)
        fix.push(`fewer than ${rules.minQuestionH2s} question-phrased H2s`);
    if (rules.requireCitableBlockquote && blockquoteWords(post.content) < 50)
        fix.push('no citable blockquote (>= 50 words)');
    if (post.faqs.length < 3)
        fix.push(`only ${post.faqs.length} FAQs (aim 3)`);
    if (post.tags.length < 2)
        fix.push('fewer than 2 tags');
    if (!post.author)
        fix.push('no author (E-E-A-T)');
    if (rules.requireSources && !(post.sources && post.sources.length >= 2))
        fix.push('fewer than 2 sources (requireSources)');
    if (!post.heroImage)
        fix.push('no hero image');
    else {
        if (!post.heroImageAlt)
            fix.push('no hero alt text');
        else if ((context.altCounts.get(post.heroImageAlt) || 0) > 1)
            fix.push('hero alt duplicated across posts');
        if (/^https?:\/\//.test(post.heroImage) && !post.heroImage.startsWith(BLOG_CONFIG.identity.siteUrl))
            fix.push('hero is hotlinked (not local)');
        if (!post.heroImageWidth || !post.heroImageHeight)
            fix.push('no image dimensions (CLS)');
    }
    // Internal links are the only backlinks you fully control, and a post nothing links to is
    // discoverable only through the sitemap. Meaningless below a handful of posts, where there is
    // no link graph to speak of yet.
    if (context.inboundCounts && context.inboundCounts.size >= 3 && (context.inboundCounts.get(post.slug) || 0) === 0) {
        fix.push('orphan: no other post links to it');
    }
    const links = [...post.content.matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1].split('#')[0].split('?')[0]);
    const bad = links.filter((p) => p !== '/' && !internal.has(p));
    if (bad.length)
        fix.push('links to unknown internal paths: ' + [...new Set(bad)].join(', '));
    if (!links.some((p) => internal.has(p)))
        fix.push('no internal links');
    const updated = Date.parse(post.updatedAt || post.publishedAt);
    if (!Number.isNaN(updated)) {
        const ageDays = (context.now.getTime() - updated) / 864e5;
        if (ageDays > context.staleAfterDays)
            fix.push(`stale: last updated ${Math.round(ageDays)} days ago`);
        if (ageDays < -1)
            fix.push('date is in the future');
    }
    else
        fix.push('unparseable date');
    const verdict = block.length ? 'BLOCK' : fix.length ? 'FIX' : 'SHIP';
    return { slug: post.slug, verdict, issues: [...block, ...fix] };
}
/** Audit posts from ANY source — a filesystem read, a database query, a test fixture. */
export function auditPosts(posts, options = {}) {
    const altCounts = new Map();
    for (const p of posts)
        altCounts.set(p.heroImageAlt, (altCounts.get(p.heroImageAlt) || 0) + 1);
    const base = blogBasePath();
    const inboundCounts = new Map(posts.map((p) => [p.slug, 0]));
    for (const post of posts) {
        for (const m of post.content.matchAll(/\]\((\/[^)]*)\)/g)) {
            const path = m[1].split('#')[0].split('?')[0];
            if (!path.startsWith(`${base}/`))
                continue;
            const target = path.slice(base.length + 1);
            if (target && target !== post.slug && inboundCounts.has(target))
                inboundCounts.set(target, (inboundCounts.get(target) || 0) + 1);
        }
    }
    const context = {
        allSlugs: new Set(posts.map((p) => p.slug)),
        inboundCounts,
        altCounts,
        now: options.now || new Date(),
        staleAfterDays: options.staleAfterDays ?? 365,
    };
    return posts.map((p) => auditPost(p, context)).sort((a, b) => (a.verdict === b.verdict ? a.slug.localeCompare(b.slug) : a.verdict === 'BLOCK' ? -1 : b.verdict === 'BLOCK' ? 1 : a.verdict === 'FIX' ? -1 : 1));
}
/** Slugs the audit says must not appear in public surfaces — feed the discovery/RSS `exclude`. */
export function blockedSlugs(entries) {
    return entries.filter((e) => e.verdict === 'BLOCK').map((e) => e.slug);
}
/** Audit the filesystem corpus at `root` (the default store). */
export function auditBlogCorpus(root, options = {}) {
    return auditPosts(readGeneratedBlogPosts({
        root,
        blogDir: options.blogDir || BLOG_CONFIG.paths.blogDir,
        fallback: { description: '', author: '', heroImage: '', heroImageAltPrefix: BLOG_CONFIG.identity.name },
    }), options);
}
export function formatAuditReport(entries) {
    const counts = { SHIP: 0, FIX: 0, BLOCK: 0 };
    for (const e of entries)
        counts[e.verdict]++;
    const lines = [`Corpus audit: ${entries.length} posts — SHIP ${counts.SHIP} · FIX ${counts.FIX} · BLOCK ${counts.BLOCK}`, ''];
    for (const e of entries) {
        if (e.verdict === 'SHIP')
            continue;
        lines.push(`${e.verdict}  ${e.slug}`);
        for (const issue of e.issues)
            lines.push(`      - ${issue}`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=audit.js.map