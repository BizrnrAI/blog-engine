import { BLOG_CONFIG, brandPersona } from './config';
import { ALLOWED_CATEGORIES, INTERNAL_LINKS } from './topics';
import { env, slugify, wordCount } from './utils';
function buildMessages(topic, existingTitles) {
    const v = BLOG_CONFIG.identity.voice;
    const system = [
        brandPersona(),
        '',
        'Write a single, original, genuinely useful SEO + AEO optimized blog post as STRICT JSON only. No prose around it.',
        '',
        "HARD RULES (this publishes automatically to a licensed broker's public site):",
        '- NEVER fabricate specific prices, percentages, statistics, dates, interest rates, or named sources. Speak qualitatively or in general ranges.',
        '- No legal, tax, or financial guarantees or advice; where relevant, suggest consulting the appropriate professional.',
        '- Be accurate and on-brand: confident, polished, local-insider, helpful. American English.',
        '- Do NOT duplicate any of these existing titles: ' + JSON.stringify(existingTitles) + '.',
        '- No contact forms. Conversion language must invite readers to speak with BRI by voice.',
        '',
        'STRUCTURE of the "body" (GitHub-flavored Markdown):',
        '- 4-6 "## " H2 sections with substantive paragraphs (700-1100 words total). NO H1; the page adds the title.',
        '- Do NOT include an FAQ section or a "Quick answer" section in the body; those render automatically from the JSON fields.',
        '- Include 2-4 natural internal links chosen ONLY from this list: ' + JSON.stringify(INTERNAL_LINKS) + '.',
        `- End with a short call-to-action paragraph inviting the reader to speak with ${v.name}; link the homepage as [speak with ${v.name}](${v.homeCtaPath}).`,
        topic.mustBacklink
            ? `- This is a cross-promo post: include ONE natural, descriptive contextual link to ${BLOG_CONFIG.identity.backlink.deepLink}, tying the AI voice receptionist angle to how a ${BLOG_CONFIG.identity.agent.title} never misses a lead.`
            : '',
    ].filter(Boolean).join('\n');
    const user = [
        `Write the post on this topic: "${topic.keyword}".`,
        `Category: ${topic.category}. Editorial angle: ${topic.angle}.`,
        '',
        'Return ONLY this JSON object:',
        '{',
        '  "title": string (compelling, <= 65 chars, include the location/keyword naturally),',
        '  "slug": string (kebab-case, <= 70 chars),',
        '  "description": string (meta description, 120-158 chars, compelling),',
        `  "category": ${JSON.stringify(topic.category)},`,
        '  "answer": string (a DIRECT 40-55 word answer to the core question, subject-verb-object, AEO-friendly),',
        '  "readMins": integer 5-9,',
        '  "faqs": array of EXACTLY 3 objects { "q": string, "a": string (2-4 sentences, factual, useful) },',
        '  "body": string (the Markdown body per the rules above)',
        '}',
    ].join('\n');
    return [
        { role: 'system', content: system },
        { role: 'user', content: user },
    ];
}
async function callLLM(messages) {
    const r = await fetch(BLOG_CONFIG.text.url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env('OPENROUTER_API_KEY')}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': BLOG_CONFIG.identity.siteUrl,
            'X-Title': `${BLOG_CONFIG.identity.name} Blog Engine`,
        },
        body: JSON.stringify({
            model: BLOG_CONFIG.text.model,
            messages,
            temperature: BLOG_CONFIG.text.temperature,
            max_tokens: BLOG_CONFIG.text.maxTokens,
            reasoning: { effort: 'none' },
            response_format: { type: 'json_object' },
        }),
    });
    if (!r.ok)
        throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    return parseJson(j.choices?.[0]?.message?.content || '');
}
function parseJson(text) {
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
export function validateGeneratedPost(post, args) {
    const errs = [];
    if (!post.title || post.title.length > 90)
        errs.push('title missing or > 90 chars');
    if (!post.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug))
        errs.push('slug missing or not kebab-case');
    if (post.slug && args.existingSlugs.includes(post.slug))
        errs.push('slug already exists: ' + post.slug);
    if (!post.description || post.description.length < 80 || post.description.length > 175)
        errs.push('description must be 80-175 chars');
    if (!post.category || !ALLOWED_CATEGORIES.includes(post.category))
        errs.push('category not allowed: ' + post.category);
    const aw = wordCount(post.answer || '');
    if (aw < 30 || aw > 70)
        errs.push(`answer must be 30-70 words (got ${aw})`);
    if (!Array.isArray(post.faqs) || post.faqs.length < 3)
        errs.push('need >= 3 faqs');
    else if (post.faqs.some((f) => !f || !f.q || !f.a))
        errs.push('every faq needs q and a');
    if (!post.body || wordCount(post.body) < 450)
        errs.push(`body too short (>= 450 words; got ${wordCount(post.body || '')})`);
    if ((post.body || '').match(/^#\s/m) || (post.body || '').match(/\n#\s/))
        errs.push('body must not contain an H1 (#)');
    const h2 = ((post.body || '').match(/^##\s/gm) || []).length;
    if (h2 < 3)
        errs.push(`body needs >= 3 H2 sections (got ${h2})`);
    if (!INTERNAL_LINKS.some((l) => (post.body || '').includes(`(${l})`)))
        errs.push('body needs >= 1 internal link from the allowed list');
    const backlinkHost = new URL(BLOG_CONFIG.identity.backlink.url).host;
    if (args.topic.mustBacklink && !(post.body || '').includes(backlinkHost))
        errs.push(`cross-promo post must link ${backlinkHost}`);
    const badLinks = [...(post.body || '').matchAll(/\]\((\/[^)]*)\)/g)]
        .map((m) => m[1].split('#')[0].split('?')[0])
        .filter((p) => p !== '/' && !INTERNAL_LINKS.includes(p));
    if (badLinks.length)
        errs.push('body links to non-existent internal paths: ' + [...new Set(badLinks)].join(', '));
    return errs;
}
function normalizePost(raw) {
    const slug = slugify(String(raw.slug || raw.title || ''));
    return {
        title: String(raw.title || ''),
        slug,
        description: String(raw.description || ''),
        category: String(raw.category || ''),
        answer: String(raw.answer || ''),
        readMins: Number(raw.readMins || 7),
        faqs: Array.isArray(raw.faqs)
            ? raw.faqs.map((f) => ({ q: String(f.q || ''), a: String(f.a || '') }))
            : [],
        body: String(raw.body || ''),
    };
}
export async function generateBlogPost(topic, existing) {
    const existingSlugs = existing.map((p) => p.slug);
    const messages = buildMessages(topic, existing.map((p) => p.title));
    let post = null;
    let errs = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
        post = normalizePost(await callLLM(messages));
        errs = validateGeneratedPost(post, { existingSlugs, topic });
        if (errs.length === 0)
            return post;
        console.warn(`[blog-generate] attempt ${attempt} rejected: ${errs.join('; ')}`);
        messages.push({ role: 'assistant', content: JSON.stringify(post).slice(0, 500) });
        messages.push({ role: 'user', content: `That JSON failed validation: ${errs.join('; ')}. Return corrected STRICT JSON only.` });
    }
    throw new Error('Could not produce a valid post after 3 attempts: ' + errs.join('; '));
}
//# sourceMappingURL=generate-post.js.map