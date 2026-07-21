import { BLOG_CONFIG, getBlogTopics } from './config.js';
import { ALLOWED_CATEGORIES, CROSS_PROMO_TOPICS, EDITORIAL_TOPICS, } from './topics.js';
import { norm, slugify } from './utils.js';
/**
 * Map a search query to one of the site's categories.
 *
 * The default deliberately returns the site's FIRST allowed category rather than guessing from
 * keywords. A guess is only useful if the engine knows the industry, and it cannot — while a
 * category outside `allowedCategories` fails validation on every retry and kills the run. Sites
 * that want smarter routing supply `topics.categoryForQuery`; see examples/sdbg for one.
 */
function categoryForQuery(q) {
    const custom = getBlogTopics().categoryForQuery;
    if (custom)
        return custom(q);
    return ALLOWED_CATEGORIES[0];
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
    // Cross-promo only makes sense with a partner site to link to. With no backlink configured the
    // engine skips the cadence entirely rather than inventing an outbound link.
    const canCrossPromo = Boolean(BLOG_CONFIG.identity.backlink) && CROSS_PROMO_TOPICS.length > 0;
    if (canCrossPromo && idx % topics.crossPromoEvery === topics.crossPromoEvery - 1) {
        for (let i = 0; i < CROSS_PROMO_TOPICS.length; i++) {
            const seed = CROSS_PROMO_TOPICS[(idx + i) % CROSS_PROMO_TOPICS.length];
            if (!isCovered(seed.keyword, existing)) {
                return {
                    type: 'crosspromo',
                    keyword: seed.keyword,
                    category: seed.category || ALLOWED_CATEGORIES[0],
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