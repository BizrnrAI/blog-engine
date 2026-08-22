export function positionMultiplier(position, ctr) {
    if (position >= 8 && position <= 30)
        return 2;
    if (position > 30 && position <= 60)
        return 1;
    if (position > 60)
        return 0.5;
    if (position < 8 && ctr < 0.01)
        return 1.5;
    return 1;
}
export function classifyAction(position, ctr) {
    if (position >= 8 && position <= 30)
        return 'refresh';
    if (position > 30 && position <= 60)
        return 'authority';
    if (position > 60)
        return 'audit';
    return 'title-experiment';
}
export function slugFromPage(page, pathPrefix = '/blog/') {
    try {
        const path = new URL(page).pathname.replace(/\/$/, '');
        const i = path.indexOf(pathPrefix);
        if (i === -1)
            return null;
        const slug = path.slice(i + pathPrefix.length);
        return /^[a-z0-9-]+$/.test(slug) ? slug : null;
    }
    catch {
        return null;
    }
}
export function rankRescueCandidates(rows, options = {}) {
    const minImpressions = options.minImpressions ?? 25;
    const prefix = options.pathPrefix || '/blog/';
    const byPage = new Map();
    for (const row of rows) {
        const agg = byPage.get(row.page) || { impressions: 0, clicks: 0, posWeighted: 0, queries: [] };
        agg.impressions += row.impressions;
        agg.clicks += row.clicks;
        agg.posWeighted += row.position * row.impressions;
        agg.queries.push(row);
        byPage.set(row.page, agg);
    }
    const out = [];
    for (const [page, agg] of byPage) {
        const slug = slugFromPage(page, prefix);
        if (!slug || agg.impressions < minImpressions)
            continue;
        const position = agg.impressions ? agg.posWeighted / agg.impressions : 0;
        const ctr = agg.impressions ? agg.clicks / agg.impressions : 0;
        const intent = options.intentWeightFor?.(slug) ?? 1;
        const score = agg.impressions * intent * positionMultiplier(position, ctr) * (agg.clicks === 0 ? 1.5 : 1);
        out.push({
            page,
            slug,
            impressions: agg.impressions,
            clicks: agg.clicks,
            ctr,
            position: Math.round(position * 10) / 10,
            score: Math.round(score),
            action: classifyAction(position, ctr),
            queries: agg.queries
                .sort((a, b) => b.impressions - a.impressions)
                .slice(0, options.topQueries ?? 8)
                .map((q) => ({ query: q.query, impressions: q.impressions, position: Math.round(q.position * 10) / 10 })),
        });
    }
    return out.sort((a, b) => b.score - a.score);
}
//# sourceMappingURL=rank-rescue.js.map