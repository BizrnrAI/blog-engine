import { BlogRunError } from './run-error.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { join } from 'node:path';
import { BLOG_CONFIG, blogBasePath, brandPersona, getBlogHooks, getBlogTopics } from './config.js';
import { contentExtensions, parseBlogFrontmatter } from './content-reader.js';
import { getStore, listExistingPosts } from './store.js';
import { contentRules, normalizeGeneratedPost, parseModelJson, relatedLinkTargets, validateGeneratedPost } from './generate-post.js';
import { getGscPageQueries } from './gsc.js';
import { toMarkdown } from './markdown.js';
import { rankRescueCandidates } from './rank-rescue.js';
import { auditPosts } from './audit.js';
import { INTERNAL_LINKS } from './topics.js';
import { verifySources } from './sources.js';
import { assertNoEmDashes, normalizeBlogProse } from './punctuation.js';
import { env } from './utils.js';
/**
 * Refresh mode — re-optimize an EXISTING post for the queries it already earns impressions on,
 * instead of publishing a new competitor. Slug, publish date, hero, OG card and gradient are
 * preserved; title/description/answer/tags/FAQs/body are regenerated under the full content
 * contract; `updated` is bumped honestly to today. This is the ASEO rank-rescue action for
 * posts at position 8–30 and the highest-ROI thing an autonomous blog can do.
 */
function monthYear() {
    return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
async function callLLM(messages) {
    const hook = getBlogHooks().generateText;
    if (hook)
        return hook({ messages, text: BLOG_CONFIG.text });
    const apiKeyEnv = BLOG_CONFIG.text.apiKeyEnv || 'OPENROUTER_API_KEY';
    const r = await fetch(BLOG_CONFIG.text.url, {
        method: 'POST',
        signal: AbortSignal.timeout(120_000),
        headers: { Authorization: `Bearer ${env(apiKeyEnv)}`, 'Content-Type': 'application/json', ...(BLOG_CONFIG.text.headers || {}) },
        body: JSON.stringify({ model: BLOG_CONFIG.text.model, messages, temperature: BLOG_CONFIG.text.temperature, max_tokens: BLOG_CONFIG.text.maxTokens, response_format: { type: 'json_object' } }),
    });
    if (!r.ok)
        throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    return String(j.choices?.[0]?.message?.content || '');
}
export function buildRefreshMessages(args) {
    const rules = contentRules();
    const identity = BLOG_CONFIG.identity;
    const ownerPages = getBlogTopics().ownerPages || [];
    const linkTargets = args.linkTargets || [];
    const queryLines = args.queries.length
        ? args.queries.map((q) => `  - "${q.query}" (${q.impressions} impressions, avg position ${q.position})`).join('\n')
        : '  - (no Search Console data; improve structure, clarity, and currency)';
    const system = [
        brandPersona(),
        '',
        `You are REFRESHING an existing published post on ${identity.name}'s site so it better answers the searches it already earns. Return STRICT JSON only.`,
        '',
        'HARD RULES:',
        '- Never use em dashes anywhere, including metadata, FAQs, sources, and alt text. Use commas, parentheses, periods, or a simple hyphen.',
        '- NEVER fabricate specific prices, percentages, statistics, dates, interest rates, review counts, awards, or named sources.',
        '- No legal, tax, medical, or financial guarantees or advice.',
        `- Be accurate and on-brand: ${rules.tone}. American English.`,
        '- Keep the post\'s core subject and the same slug; you may sharpen the title, but do not change what the page is about.',
        '- Keep anything in the existing body that is accurate and useful; cut filler; add the missing answers the queries below reveal.',
        '- Update time-sensitive claims only when supported by current evidence. Do not label old facts newly verified just because this post is refreshed.',
        '- Do NOT duplicate these other post titles: ' + JSON.stringify(args.otherTitles.slice(0, 40)) + '.',
        ...rules.extraRules,
        '',
        'STRUCTURE of the "body" (GitHub-flavored Markdown):',
        '- Answer-first lede (2-3 sentences). 4-6 "## " H2 sections, 700-1100 words, NO H1.',
        `- At least ${rules.minQuestionH2s} H2s phrased as the real search questions below, each opening with a DIRECT 40-60 word answer.`,
        rules.requireCitableBlockquote
            ? `- Exactly ONE "> " blockquote of 120-160 words: a self-contained, citable passage with concrete scope and the timeframe "as of ${monthYear()}".`
            : '',
        '- Tables/lists over prose for comparisons. No FAQ or quick-answer section in the body.',
        '- Use plain Markdown only, without embedded HTML, scripts, or javascript/data links.',
        '- Include 2-4 internal links chosen ONLY from: ' + JSON.stringify(INTERNAL_LINKS) + '.',
        linkTargets.length
            ? '- Internal link graph: where genuinely relevant, link 1-2 of these EXISTING posts by their exact path (descriptive anchor text): ' + JSON.stringify(linkTargets) + '.'
            : '',
        ownerPages.length
            ? '- These pages are the canonical OWNERS of their commercial topics: ' + JSON.stringify(ownerPages) + '. Support them — link the most relevant one naturally — and keep this post a distinct, more specific answer that hands off to the owner for the decision.'
            : '',
        rules.requireSources ? '- Cite 2-4 authoritative sources with exact URLs in the sources array. Every URL is checked live before publication; never invent a URL.' : '',
        rules.blockedPhrases.length ? '- NEVER use these phrases: ' + JSON.stringify(rules.blockedPhrases) + '.' : '',
    ].filter(Boolean).join('\n');
    const user = [
        `Existing post: "${args.title}" (slug: ${args.slug}, category: ${args.category}).`,
        '',
        'Real search queries this page currently earns (from Search Console, last 28 days):',
        queryLines,
        '',
        'Existing sources to verify and retain when they still support the refreshed claims:',
        JSON.stringify(args.sources || []),
        '',
        'Existing body (Markdown):',
        '"""',
        args.existingBody.slice(0, 9000),
        '"""',
        '',
        'Return ONLY this JSON object:',
        '{',
        '  "title": string (keep meaning; may sharpen; aim <= 65 chars),',
        `  "slug": ${JSON.stringify(args.slug)},`,
        '  "description": string (meta description, aim 120-158 chars, active voice),',
        `  "category": ${JSON.stringify(args.category)},`,
        '  "answer": string (DIRECT 40-55 word answer to the core question),',
        '  "readMins": integer 5-9,',
        '  "tags": array of 3-6 short lowercase topical tags,',
        '  "faqs": array of EXACTLY 3 objects { "q": string (a real search question, ideally from the list above), "a": string (2-4 sentences) },',
        '  "sources": array of objects { "title": string, "url": string (absolute https URL), "publisher": string }; retain supporting citations,',
        '  "body": string (the refreshed Markdown body per the rules above)',
        '}',
    ].join('\n');
    return [
        { role: 'system', content: system },
        { role: 'user', content: user },
    ];
}
export async function refreshBlogPost(root, slug, args = {}) {
    const store = getStore(root);
    if (store.publicationStatus && store.publicationStatus !== 'published')
        throw new Error('Refresh requires a published store and must not unpublish an existing article');
    const posts = await store.listPosts();
    const stored = posts.find((p) => p.slug === slug);
    if (!stored)
        throw new Error(`refresh: no such post ${slug} in store "${store.name}"`);
    // A filesystem store keeps extras the parsed shape does not carry (gradient, feature flags),
    // so read the raw frontmatter too and let it fill in around the stored post.
    const dir = join(root, BLOG_CONFIG.paths.blogDir);
    const file = contentExtensions().map((ext) => join(dir, `${slug}${ext}`)).find((f) => existsSync(f)) || join(dir, `${slug}${contentExtensions()[0]}`);
    const frontmatter = store.root && existsSync(file) ? parseBlogFrontmatter(readFileSync(file, 'utf8')).frontmatter : {};
    const content = stored.content;
    const existing = await listExistingPosts(root);
    const otherTitles = existing.filter((p) => p.slug !== slug).map((p) => p.title);
    const otherSlugs = existing.filter((p) => p.slug !== slug).map((p) => p.slug);
    // The slug is the one invariant of a refresh — pin it so normalizeGeneratedPost keeps it
    // verbatim and the validator asserts it. The title stays free: a refresh may sharpen it.
    const topic = { type: 'editorial', keyword: stored.title || slug, category: stored.category || '', angle: 'refresh', mustBacklink: false, slug };
    const messages = buildRefreshMessages({
        title: stored.title || slug,
        slug,
        category: stored.category || '',
        existingBody: content,
        queries: args.queries || [],
        otherTitles,
        sources: stored.sources,
        linkTargets: relatedLinkTargets(existing.filter((p) => p.slug !== slug)),
    });
    let errs = [];
    let post = null;
    for (let attempt = 1; attempt <= 3 && !post; attempt++) {
        let rawText = '';
        try {
            rawText = await callLLM(messages);
            const candidate = normalizeGeneratedPost(parseModelJson(rawText), topic);
            errs = validateGeneratedPost(candidate, { existingSlugs: otherSlugs, topic });
            if (!errs.length && candidate.sources?.length)
                errs = await verifySources(candidate.sources);
            if (!errs.length && getBlogHooks().validatePost) {
                errs = await getBlogHooks().validatePost({ post: candidate, topic, operation: 'refresh' });
            }
            if (!errs.length) {
                post = candidate;
                break;
            }
            messages.push({ role: 'assistant', content: JSON.stringify(candidate).slice(0, 500) });
            messages.push({ role: 'user', content: `That JSON failed validation: ${errs.join('; ')}. Return corrected STRICT JSON only.` });
        }
        catch (err) {
            errs = ['model output was not parseable JSON: ' + (err instanceof Error ? err.message : String(err))];
            console.warn(`[blog-refresh] attempt ${attempt} unparseable; head: ${rawText.slice(0, 200)}` +
                (rawText.length > 400 ? ` ... tail: ${rawText.slice(-200)}` : ''));
            messages.push({ role: 'user', content: 'Your previous output was not valid JSON. Return ONLY the strict JSON object.' });
            continue;
        }
        console.warn(`[blog-refresh] attempt ${attempt} rejected: ${errs.join('; ')}`);
    }
    if (!post)
        throw new Error(`Could not refresh ${slug} after 3 attempts: ` + errs.join('; '));
    // Preserve the visual + date identity of the post; only `updated` moves.
    post.heroImageAlt = undefined;
    const cover = {
        image: stored.heroImage || '',
        imageAlt: normalizeBlogProse(stored.heroImageAlt || `${BLOG_CONFIG.identity.name} guide: ${post.title}`),
        ogImage: stored.ogImage || stored.heroImage || '',
        source: 'ai-generated',
        ...(stored.heroImageWidth ? { width: stored.heroImageWidth, height: stored.heroImageHeight } : {}),
        ...(stored.heroImageSrcset ? { srcset: stored.heroImageSrcset } : {}),
    };
    // A pre-contract post has no recorded dimensions; read them from the local hero so the refresh
    // also closes the CLS gap instead of preserving it.
    if (!cover.width && store.root && cover.image.startsWith('/')) {
        const heroFile = join(root, 'public', cover.image);
        if (existsSync(heroFile)) {
            try {
                const m = await sharp(heroFile).metadata();
                if (m.width && m.height) {
                    cover.width = m.width;
                    cover.height = m.height;
                }
            }
            catch { /* unreadable image: leave dims unset */ }
        }
    }
    const today = new Date().toISOString().slice(0, 10);
    const renderArgs = { post, cover, gradient: frontmatter.gradient || '', dateISO: stored.publishedAt || today, author: stored.author || BLOG_CONFIG.identity.author?.name };
    const render = getBlogHooks().renderMarkdown;
    let markdown = render ? render(renderArgs) : toMarkdown(post, renderArgs);
    // toMarkdown writes updated = dateISO; a refresh must carry today's date there.
    markdown = markdown.replace(/^updated: .*$/m, `updated: ${today}`);
    assertNoEmDashes({ post, cover, markdown });
    if (!args.dryRun) {
        const persist = getBlogHooks().persistPost;
        if (persist) {
            const alsoWriteFile = (await persist({ post, cover, markdown, file, root, isRefresh: true })) === true;
            if (alsoWriteFile)
                writeFileSync(file, markdown, 'utf8');
        }
        else {
            await store.putPost({ post, cover, markdown, dateISO: today, isRefresh: true });
        }
    }
    return { post, markdown, file };
}
export async function refreshBlogRun(root, options) {
    const logPrefix = BLOG_CONFIG.logPrefix || '[blog-engine]';
    if (process.env.BLOG_ENGINE_DISABLED === '1')
        return { refreshed: [], candidates: [], skipped: 'BLOG_ENGINE_DISABLED' };
    const prefix = `${blogBasePath()}/`;
    const rows = await getGscPageQueries(prefix);
    const candidates = rankRescueCandidates(rows, { pathPrefix: prefix });
    const byslug = new Map(candidates.map((c) => [c.slug, c]));
    let slugs = options.slugs && options.slugs.length ? options.slugs : candidates.filter((c) => c.action === 'refresh').slice(0, options.max ?? 1).map((c) => c.slug);
    {
        const known = new Set((await getStore(root).listPosts()).map((p) => p.slug));
        slugs = slugs.filter((s) => known.has(s));
    }
    if (!slugs.length && options.backlog !== false) {
        // No demand-led candidate: heal the long tail — the FIX post with the most issues, oldest first.
        const fixes = auditPosts(await getStore(root).listPosts()).filter((e) => e.verdict === 'FIX');
        const dates = new Map((await listExistingPosts(root)).map((p) => [p.slug, p.date || '']));
        fixes.sort((a, b) => b.issues.length - a.issues.length || (dates.get(a.slug) || '').localeCompare(dates.get(b.slug) || ''));
        if (fixes.length) {
            slugs = [fixes[0].slug];
            console.log(`${logPrefix} refresh: no Search Console candidates - backlog pick ${fixes[0].slug} (${fixes[0].issues.length} audit issues)`);
        }
    }
    // A change needs 2-45 days to surface across search and answer engines. Rewriting a post
    // before then destroys the evidence for whether the last rewrite worked.
    const cooldown = contentRules().minDaysBetweenRefresh ?? 45;
    if (cooldown > 0 && !(options.slugs && options.slugs.length)) {
        const recent = new Map((await getStore(root).listPosts()).map((p) => [p.slug, Date.parse(p.updatedAt || p.publishedAt)]));
        const cutoff = Date.now() - cooldown * 864e5;
        const held = slugs.filter((s) => { const t = recent.get(s); return t !== undefined && !Number.isNaN(t) && t > cutoff; });
        if (held.length)
            console.log(`${logPrefix} refresh: ${held.join(', ')} refreshed within ${cooldown}d - holding for the evidence window`);
        slugs = slugs.filter((s) => !held.includes(s));
    }
    if (!slugs.length) {
        console.log(`${logPrefix} refresh: no candidates (${candidates.length} scored pages; pass --slugs to force).`);
        return { refreshed: [], candidates, skipped: 'NO_CANDIDATES' };
    }
    const refreshed = [];
    try {
        for (const slug of slugs) {
            const c = byslug.get(slug);
            console.log(`${logPrefix} refreshing ${slug}${c ? ` (pos ${c.position}, ${c.impressions} impr, score ${c.score})` : ''}`);
            const { markdown } = await refreshBlogPost(root, slug, { queries: c?.queries, dryRun: options.dryRun });
            if (options.dryRun)
                console.log(`\n-------- DRY RUN refresh ${slug} --------\n${markdown}\n-------- END --------\n`);
            else
                refreshed.push(slug);
        }
        return { refreshed, candidates };
    }
    catch (error) {
        throw new BlogRunError('refresh', refreshed, error);
    }
}
//# sourceMappingURL=refresh.js.map