import { BLOG_CONFIG, brandPersona, getBlogHooks } from './config.js';
import { ALLOWED_CATEGORIES, INTERNAL_LINKS } from './topics.js';
import { clampText, env, slugify, wordCount } from './utils.js';
const DEFAULT_RULES = {
    minBodyWords: 450,
    maxDescriptionChars: 300,
    clampDescriptionTo: 158,
    minQuestionH2s: 2,
    requireCitableBlockquote: true,
    blockedPhrases: [],
    // Domain-neutral defaults. Anything industry-specific belongs in a site's own config, never here.
    tone: 'confident, clear, genuinely helpful',
    ctaInstruction: '',
    crossPromoInstruction: '',
    extraRules: [],
};
export function contentRules() {
    return { ...DEFAULT_RULES, ...(BLOG_CONFIG.content || {}) };
}
function monthYear() {
    return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function buildMessages(topic, existingTitles) {
    const identity = BLOG_CONFIG.identity;
    const rules = contentRules();
    /**
     * The closing CTA. A brand with an AI voice agent routes readers to it; everything else gets a
     * plain invitation to the site's conversion path. Either can be replaced wholesale via
     * `content.ctaInstruction`, because no engine should presume how a business converts.
     */
    const ctaPath = identity.ctaPath || identity.voice?.homeCtaPath || '/';
    const ctaInstruction = rules.ctaInstruction ||
        (identity.voice
            ? `- End with a short call-to-action paragraph inviting the reader to speak with ${identity.voice.name}; link it as [speak with ${identity.voice.name}](${identity.voice.homeCtaPath}).`
            : `- End with a short, low-pressure call-to-action paragraph inviting the reader to get in touch with ${identity.name}; link it as [${identity.name}](${ctaPath}).`);
    const crossPromoInstruction = topic.mustBacklink && identity.backlink
        ? rules.crossPromoInstruction ||
            `- This is a cross-promo post: include ONE natural, descriptive contextual link to ${identity.backlink.deepLink}, introduced in a way that genuinely serves the reader rather than as an aside.`
        : '';
    const system = [
        brandPersona(),
        '',
        'Write a single, original, genuinely useful SEO + AEO optimized blog post as STRICT JSON only. No prose around it.',
        '',
        'HARD RULES (this publishes automatically to a public brand site):',
        '- NEVER fabricate specific prices, percentages, statistics, dates, interest rates, review counts, awards, or named sources. Speak qualitatively or in general ranges.',
        '- No legal, tax, medical, or financial guarantees or advice; where relevant, suggest consulting the appropriate professional.',
        `- Be accurate and on-brand: ${rules.tone}. American English.`,
        '- Do NOT duplicate any of these existing titles: ' + JSON.stringify(existingTitles) + '.',
        ...rules.extraRules,
        '',
        'STRUCTURE of the "body" (GitHub-flavored Markdown) — write for both human readers and answer engines:',
        '- Open with a 2-3 sentence answer-first lede that resolves the core question immediately. No throat-clearing, no "in this article".',
        '- Then 4-6 "## " H2 sections with substantive paragraphs (700-1100 words total). NO H1; the page adds the title.',
        `- At least ${rules.minQuestionH2s} of the H2 headings must be phrased as natural questions a reader would search (e.g. "How much does ... cost?"). Open each question H2 with a DIRECT 40-60 word answer paragraph before elaborating.`,
        rules.requireCitableBlockquote
            ? `- Include exactly ONE Markdown blockquote ("> ") of 80-140 words: a self-contained, citable passage stating the post's key takeaway with clear scope and the timeframe "as of ${monthYear()}". It must make sense with zero surrounding context (no "as above", no dangling pronouns) — this is the passage an AI assistant should quote.`
            : '',
        '- Where the content compares options, steps, or trade-offs, prefer a compact Markdown table or bulleted list over dense prose.',
        '- Do NOT include an FAQ section or a "Quick answer" section in the body; those render automatically from the JSON fields.',
        '- Include 2-4 natural internal links chosen ONLY from this list: ' + JSON.stringify(INTERNAL_LINKS) + '.',
        ctaInstruction,
        crossPromoInstruction,
        rules.blockedPhrases.length
            ? '- NEVER use any of these phrases (claims discipline): ' + JSON.stringify(rules.blockedPhrases) + '.'
            : '',
    ].filter(Boolean).join('\n');
    const user = [
        `Write the post on this topic: "${topic.keyword}".`,
        `Category: ${topic.category}. Editorial angle: ${topic.angle}.`,
        '',
        'Return ONLY this JSON object:',
        '{',
        '  "title": string (compelling, aim <= 65 chars, include the location/keyword naturally),',
        '  "slug": string (kebab-case, <= 70 chars),',
        '  "description": string (meta description, aim 120-158 chars, active voice, states the concrete benefit of reading),',
        `  "category": ${JSON.stringify(topic.category)},`,
        '  "answer": string (a DIRECT 40-55 word answer to the core question, subject-verb-object, AEO-friendly),',
        '  "readMins": integer 5-9,',
        '  "tags": array of 3-6 short lowercase topical tags (no brand names),',
        '  "heroImageAlt": string (8-16 words literally describing a photographic scene that fits the post, e.g. "sunlit craftsman bungalow with a wraparound porch on a quiet street"),',
        '  "faqs": array of EXACTLY 3 objects { "q": string (phrased as a real user search), "a": string (2-4 sentences, factual, useful) },',
        '  "body": string (the Markdown body per the rules above)',
        '}',
    ].join('\n');
    return [
        { role: 'system', content: system },
        { role: 'user', content: user },
    ];
}
async function callLLM(messages) {
    const hook = getBlogHooks().generateText;
    if (hook)
        return hook({ messages, text: BLOG_CONFIG.text });
    const apiKeyEnv = BLOG_CONFIG.text.apiKeyEnv || 'OPENROUTER_API_KEY';
    const r = await fetch(BLOG_CONFIG.text.url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env(apiKeyEnv)}`,
            'Content-Type': 'application/json',
            ...(BLOG_CONFIG.text.provider === 'openrouter'
                ? {
                    'HTTP-Referer': BLOG_CONFIG.identity.siteUrl,
                    'X-Title': `${BLOG_CONFIG.identity.name} Blog Engine`,
                }
                : {}),
            ...(BLOG_CONFIG.text.headers || {}),
        },
        body: JSON.stringify({
            model: BLOG_CONFIG.text.model,
            messages,
            temperature: BLOG_CONFIG.text.temperature,
            max_tokens: BLOG_CONFIG.text.maxTokens,
            ...(BLOG_CONFIG.text.provider === 'openrouter' ? { reasoning: { effort: 'none' } } : {}),
            response_format: { type: 'json_object' },
        }),
    });
    if (!r.ok)
        throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    return String(j.choices?.[0]?.message?.content || '');
}
export function parseModelJson(text) {
    let t = text.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence)
        t = fence[1].trim();
    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (first !== -1 && last !== -1)
        t = t.slice(first, last + 1);
    return JSON.parse(t);
}
function questionH2Count(body) {
    return (body.match(/^##\s+[^\n]*\?\s*$/gm) || []).length;
}
function blockquoteWordCount(body) {
    const lines = body.split('\n').filter((l) => /^>\s?/.test(l));
    return wordCount(lines.map((l) => l.replace(/^>\s?/, '')).join(' '));
}
export function validateGeneratedPost(post, args) {
    const rules = contentRules();
    const errs = [];
    if (!post.title || post.title.length > 90)
        errs.push('title missing or > 90 chars');
    if (!post.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug))
        errs.push('slug missing or not kebab-case');
    if (post.slug && args.existingSlugs.includes(post.slug))
        errs.push('slug already exists: ' + post.slug);
    // Descriptions are clamped deterministically in normalizeGeneratedPost; only
    // reject when the model produced something unusably short or absurdly long.
    if (!post.description || post.description.length < 70)
        errs.push('description too short (< 70 chars)');
    else if (post.description.length > rules.maxDescriptionChars)
        errs.push(`description > ${rules.maxDescriptionChars} chars even for clamping`);
    if (!post.category || !ALLOWED_CATEGORIES.includes(post.category))
        errs.push('category not allowed: ' + post.category);
    const aw = wordCount(post.answer || '');
    if (aw < 30 || aw > 70)
        errs.push(`answer must be 30-70 words (got ${aw})`);
    if (!Array.isArray(post.tags) || post.tags.length < 2)
        errs.push('need >= 2 tags');
    if (!Array.isArray(post.faqs) || post.faqs.length < 3)
        errs.push('need >= 3 faqs');
    else if (post.faqs.some((f) => !f || !f.q || !f.a))
        errs.push('every faq needs q and a');
    if (!post.body || wordCount(post.body) < rules.minBodyWords)
        errs.push(`body too short (>= ${rules.minBodyWords} words; got ${wordCount(post.body || '')})`);
    if ((post.body || '').match(/^#\s/m) || (post.body || '').match(/\n#\s/))
        errs.push('body must not contain an H1 (#)');
    const h2 = ((post.body || '').match(/^##\s/gm) || []).length;
    if (h2 < 3)
        errs.push(`body needs >= 3 H2 sections (got ${h2})`);
    const qH2 = questionH2Count(post.body || '');
    if (qH2 < rules.minQuestionH2s)
        errs.push(`body needs >= ${rules.minQuestionH2s} question-phrased H2s ending in "?" (got ${qH2})`);
    if (rules.requireCitableBlockquote) {
        const bq = blockquoteWordCount(post.body || '');
        if (bq < 50)
            errs.push(`body needs one citable "> " blockquote of ~80-140 words (got ${bq} blockquote words)`);
        else if (bq > 200)
            errs.push(`citable blockquote too long (${bq} words; keep it a single quotable passage)`);
    }
    if (!INTERNAL_LINKS.some((l) => (post.body || '').includes(`(${l})`)))
        errs.push('body needs >= 1 internal link from the allowed list');
    const backlink = BLOG_CONFIG.identity.backlink;
    if (args.topic.mustBacklink && backlink) {
        const backlinkHost = new URL(backlink.url).host;
        if (!(post.body || '').includes(backlinkHost))
            errs.push(`cross-promo post must link ${backlinkHost}`);
    }
    const badLinks = [...(post.body || '').matchAll(/\]\((\/[^)]*)\)/g)]
        .map((m) => m[1].split('#')[0].split('?')[0])
        .filter((p) => p !== '/' && !INTERNAL_LINKS.includes(p));
    if (badLinks.length)
        errs.push('body links to non-existent internal paths: ' + [...new Set(badLinks)].join(', '));
    const haystack = [post.title, post.description, post.answer, post.body, ...(post.faqs || []).flatMap((f) => [f?.q, f?.a])]
        .join('\n')
        .toLowerCase();
    const blocked = rules.blockedPhrases.filter((p) => haystack.includes(p.toLowerCase()));
    if (blocked.length)
        errs.push('blocked claim phrases present: ' + blocked.join(', '));
    return errs;
}
export function normalizeGeneratedPost(raw) {
    const rules = contentRules();
    const slug = slugify(String(raw.slug || raw.title || ''));
    return {
        title: String(raw.title || '').trim(),
        slug,
        description: clampText(String(raw.description || ''), rules.clampDescriptionTo),
        category: String(raw.category || ''),
        answer: String(raw.answer || '').trim(),
        readMins: Number(raw.readMins || 7),
        tags: Array.isArray(raw.tags)
            ? [...new Set(raw.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean))].slice(0, 6)
            : [],
        heroImageAlt: raw.heroImageAlt ? clampText(String(raw.heroImageAlt), 140) : undefined,
        faqs: Array.isArray(raw.faqs)
            ? raw.faqs.map((f) => ({ q: String(f.q || '').trim(), a: String(f.a || '').trim() }))
            : [],
        body: String(raw.body || '').trim(),
    };
}
export async function generateBlogPost(topic, existing) {
    const existingSlugs = existing.map((p) => p.slug);
    const messages = buildMessages(topic, existing.map((p) => p.title));
    let errs = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
        let rawText = '';
        try {
            rawText = await callLLM(messages);
            const post = normalizeGeneratedPost(parseModelJson(rawText));
            errs = validateGeneratedPost(post, { existingSlugs, topic });
            if (errs.length === 0)
                return post;
            messages.push({ role: 'assistant', content: JSON.stringify(post).slice(0, 500) });
            messages.push({ role: 'user', content: `That JSON failed validation: ${errs.join('; ')}. Return corrected STRICT JSON only.` });
        }
        catch (err) {
            // A parse throw must consume an attempt with structural feedback, never
            // abort the retry loop (models add preambles, fences, and stray text).
            errs = ['model output was not parseable JSON: ' + (err instanceof Error ? err.message : String(err))];
            console.warn(`[blog-generate] attempt ${attempt} unparseable; head: ${rawText.slice(0, 200)}`);
            messages.push({ role: 'user', content: 'Your previous output was not valid JSON. Return ONLY the strict JSON object, no fences, no prose.' });
            continue;
        }
        console.warn(`[blog-generate] attempt ${attempt} rejected: ${errs.join('; ')}`);
    }
    throw new Error('Could not produce a valid post after 3 attempts: ' + errs.join('; '));
}
//# sourceMappingURL=generate-post.js.map