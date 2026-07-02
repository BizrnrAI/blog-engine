import { BLOG_CONFIG, getBlogTopics } from './config';
import { CROSS_PROMO_TOPICS, EDITORIAL_TOPICS, } from './topics';
import { norm, slugify } from './utils';
function categoryForQuery(q) {
    const custom = getBlogTopics().categoryForQuery;
    if (custom)
        return custom(q);
    const t = q.toLowerCase();
    if (/(sell|selling|worth|valuation|list my)/.test(t))
        return 'Selling';
    if (/(market|trend|forecast|prices?)/.test(t))
        return 'Market Insights';
    if (/(la jolla|del mar|coronado|rancho santa fe|carlsbad|encinitas|downtown|point loma|pacific beach|neighborhood)/.test(t))
        return 'Neighborhoods';
    if (/(move|moving|relocat|family|families|lifestyle|best place)/.test(t))
        return 'Lifestyle';
    return 'Buying';
}
function isCovered(keyword, existing) {
    const slug = slugify(keyword);
    if (existing.some((p) => p.slug === slug))
        return true;
    const distinctive = norm(keyword).split(' ').filter((w) => w.length > 3).slice(0, 2);
    return existing.some((p) => {
        const t = norm(p.title);
        return distinctive.length >= 2 && distinctive.every((w) => t.includes(w));
    });
}
export function pickTopic(existing, gscQueries, offset) {
    const idx = existing.length + offset;
    const topics = getBlogTopics();
    if (idx % topics.crossPromoEvery === topics.crossPromoEvery - 1) {
        for (let i = 0; i < CROSS_PROMO_TOPICS.length; i++) {
            const seed = CROSS_PROMO_TOPICS[(idx + i) % CROSS_PROMO_TOPICS.length];
            if (!isCovered(seed.keyword, existing)) {
                return {
                    type: 'crosspromo',
                    keyword: seed.keyword,
                    category: seed.category || 'AI & Real Estate',
                    angle: seed.angle,
                    mustBacklink: true,
                };
            }
        }
    }
    if (idx % 2 === 0) {
        const hit = gscQueries.find((q) => !isCovered(q.query, existing));
        if (hit) {
            return {
                type: 'gsc',
                keyword: hit.query,
                category: categoryForQuery(hit.query),
                angle: topics.gscAngleForQuery?.(hit.query) || `directly answer the search intent behind "${hit.query}"`,
                mustBacklink: false,
                impressions: hit.impressions,
            };
        }
    }
    for (let i = 0; i < EDITORIAL_TOPICS.length; i++) {
        const seed = EDITORIAL_TOPICS[(idx + i) % EDITORIAL_TOPICS.length];
        if (!isCovered(seed.keyword, existing)) {
            return { type: 'editorial', ...seed, mustBacklink: false };
        }
    }
    const seed = EDITORIAL_TOPICS[idx % EDITORIAL_TOPICS.length];
    return { type: 'editorial', ...seed, mustBacklink: false };
}
export function describeTopic(topic) {
    const impressions = topic.impressions ? ` · ${topic.impressions} impressions` : '';
    return `[${topic.type}] "${topic.keyword}" (${topic.category})${impressions} · ${BLOG_CONFIG.identity.siteHost}`;
}
//# sourceMappingURL=topic-rotation.js.map