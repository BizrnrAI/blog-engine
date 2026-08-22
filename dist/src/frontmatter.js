import { getBlogConfig } from './config.js';
/**
 * Frontmatter key aliases.
 *
 * The engine's own `toMarkdown` writes `date/updated/image/imageAlt/...`, but a site that owns its
 * frontmatter shape through `hooks.renderMarkdown` (or that predates the engine) commonly uses
 * `pubDate/updatedDate/cover/coverAlt/readingTime`. Without a translation those posts look
 * date-less and image-less to the cadence guard, the corpus audit, the scorecard and refresh mode.
 *
 * Normalization is ADDITIVE and canonical-first: an alias only fills a canonical key that is not
 * already present, and every original key is preserved, so existing adapters (and any code reading
 * `frontmatter.pubDate` directly) behave exactly as before.
 */
export const DEFAULT_FRONTMATTER_ALIASES = Object.freeze({
    pubDate: 'date',
    publishDate: 'date',
    updatedDate: 'updated',
    modifiedDate: 'updated',
    cover: 'image',
    heroImage: 'image',
    coverAlt: 'imageAlt',
    heroAlt: 'imageAlt',
    coverWidth: 'imageWidth',
    heroImageWidth: 'imageWidth',
    coverHeight: 'imageHeight',
    heroImageHeight: 'imageHeight',
    readingTime: 'readMins',
});
/**
 * Canonical values the engine expects as numbers/dates, coerced from the shapes sites really use:
 * `readingTime: "7 min"` → `readMins: "7"`, `pubDate: 2026-07-01T12:00:00-07:00` → `date: 2026-07-01`.
 * Anything unrecognized passes through untouched — a coercion never invents data.
 */
export function coerceFrontmatterValue(canonicalKey, value) {
    if (canonicalKey === 'readMins') {
        const n = value.match(/\d+/);
        return n ? n[0] : value;
    }
    if (canonicalKey === 'date' || canonicalKey === 'updated') {
        const d = value.match(/^\d{4}-\d{2}-\d{2}/);
        return d ? d[0] : value;
    }
    return value;
}
/** Site-configured aliases merged over the defaults; falls back to the defaults with no runtime. */
export function resolveFrontmatterAliases() {
    try {
        const configured = getBlogConfig().paths.frontmatterAliases;
        return configured ? { ...DEFAULT_FRONTMATTER_ALIASES, ...configured } : DEFAULT_FRONTMATTER_ALIASES;
    }
    catch {
        return DEFAULT_FRONTMATTER_ALIASES; // standalone use without a configured runtime
    }
}
export function normalizeFrontmatter(frontmatter, aliases = resolveFrontmatterAliases()) {
    const out = { ...frontmatter };
    for (const [alias, canonical] of Object.entries(aliases)) {
        const raw = frontmatter[alias];
        if (raw === undefined || raw === '')
            continue;
        // Canonical wins: a post carrying both keeps what the engine wrote.
        if (out[canonical] !== undefined && out[canonical] !== '')
            continue;
        out[canonical] = coerceFrontmatterValue(canonical, raw);
    }
    // Coerce a canonical value that arrived in a site's own format (e.g. readMins: "7 min").
    for (const key of ['readMins', 'date', 'updated']) {
        if (out[key] !== undefined)
            out[key] = coerceFrontmatterValue(key, out[key]);
    }
    return out;
}
//# sourceMappingURL=frontmatter.js.map