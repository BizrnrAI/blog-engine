import { hasEmDash, normalizeBlogProse } from './punctuation.js';
import { BLOG_CONFIG, brandPersona, getBlogHooks } from './config.js';
import { contentRules, parseModelJson } from './generate-post.js';
import { getGscPageQueries } from './gsc.js';
import { env, wordCount } from './utils.js';
const QUESTION_RE = /^(how|what|why|when|where|which|who|can|could|should|do|does|did|is|are|was|will)\b|\?$/i;
export function questionLikeQueries(queries, limit = 12) {
    return [...queries]
        .filter((q) => QUESTION_RE.test(q.query.trim()))
        .sort((a, b) => b.impressions - a.impressions)
        .map((q) => q.query)
        .filter((q, i, arr) => arr.indexOf(q) === i)
        .slice(0, limit);
}
async function callLLM(messages) {
    const hook = getBlogHooks().generateText;
    if (hook)
        return hook({ messages, text: BLOG_CONFIG.text });
    const apiKeyEnv = BLOG_CONFIG.text.apiKeyEnv || 'OPENROUTER_API_KEY';
    const r = await fetch(BLOG_CONFIG.text.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env(apiKeyEnv)}`, 'Content-Type': 'application/json', ...(BLOG_CONFIG.text.headers || {}) },
        body: JSON.stringify({ model: BLOG_CONFIG.text.model, messages, temperature: BLOG_CONFIG.text.temperature, max_tokens: BLOG_CONFIG.text.maxTokens, response_format: { type: 'json_object' } }),
    });
    if (!r.ok)
        throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    return String(j.choices?.[0]?.message?.content || '');
}
export function validateFanout(passages, expected) {
    const rules = contentRules();
    const errs = [];
    if (hasEmDash(passages))
        errs.push('em dashes are forbidden');
    if (passages.length < Math.min(expected, 2))
        errs.push(`need >= ${Math.min(expected, 2)} passages (got ${passages.length})`);
    passages.forEach((p, i) => {
        if (!p.question || !/\?$/.test(p.question.trim()))
            errs.push(`passage ${i + 1}: question must end with "?"`);
        const w = wordCount(p.answer || '');
        if (w < 30 || w > 80)
            errs.push(`passage ${i + 1}: answer must be 40-60 words (got ${w})`);
    });
    const hay = passages.map((p) => `${p.question}\n${p.answer}`).join('\n').toLowerCase();
    const blocked = rules.blockedPhrases.filter((b) => hay.includes(b.toLowerCase()));
    if (blocked.length)
        errs.push('blocked claim phrases present: ' + blocked.join(', '));
    return errs;
}
export async function generateFanoutPassages(ownerPath, options = {}) {
    const count = options.count ?? 4;
    const rules = contentRules();
    let queries = options.queries || [];
    if (!queries.length) {
        const rows = await getGscPageQueries(ownerPath);
        queries = questionLikeQueries(rows.filter((r) => r.page.includes(ownerPath)));
    }
    if (!queries.length)
        throw new Error(`fanout: no question-like queries for ${ownerPath} (pass --queries or configure Search Console)`);
    const system = [
        brandPersona(),
        'Never use em dashes in any field. Use commas, parentheses, periods, or a simple hyphen.',
        '',
        `You are adding answer passages to the page ${BLOG_CONFIG.identity.siteUrl}${ownerPath} — the canonical owner of its topic. Return STRICT JSON only.`,
        'HARD RULES: never fabricate prices, percentages, statistics, dates, awards, or named sources; no legal/tax/medical/financial guarantees or advice; ' + `${rules.tone}; American English.`,
        rules.blockedPhrases.length ? '- NEVER use these phrases: ' + JSON.stringify(rules.blockedPhrases) + '.' : '',
        ...rules.extraRules,
    ].filter(Boolean).join('\n');
    const user = [
        `Real search questions this page earns: ${JSON.stringify(queries)}`,
        '',
        `Return ONLY: { "passages": [ ${count} objects { "question": string (a natural question ending in "?", reusing the search wording), "answer": string (DIRECT 40-60 word answer, subject-verb-object, self-contained, no "as above") } ] }`,
    ].join('\n');
    const messages = [
        { role: 'system', content: system },
        { role: 'user', content: user },
    ];
    let errs = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
        let raw = '';
        try {
            raw = await callLLM(messages);
            const j = parseModelJson(raw);
            const passages = (Array.isArray(j.passages) ? j.passages : []).map((p) => ({
                question: normalizeBlogProse(String(p?.question || '')).trim(),
                answer: normalizeBlogProse(String(p?.answer || '')).trim(),
            }));
            errs = validateFanout(passages, count);
            if (!errs.length)
                return { ownerPath, generatedAt: new Date().toISOString(), sourceQueries: queries, passages };
            messages.push({ role: 'assistant', content: JSON.stringify({ passages }).slice(0, 800) });
            messages.push({ role: 'user', content: `That failed validation: ${errs.join('; ')}. Return corrected STRICT JSON only.` });
        }
        catch (err) {
            errs = ['unparseable JSON: ' + (err instanceof Error ? err.message : String(err))];
            console.warn(`[blog-fanout] attempt ${attempt} unparseable; head: ${raw.slice(0, 200)}`);
            messages.push({ role: 'user', content: 'Return ONLY the strict JSON object.' });
        }
    }
    throw new Error(`fanout: could not produce valid passages for ${ownerPath}: ` + errs.join('; '));
}
//# sourceMappingURL=fanout.js.map