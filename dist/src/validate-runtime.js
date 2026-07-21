export class BlogEngineConfigError extends Error {
    problems;
    constructor(problems) {
        super(`Blog engine configuration is not usable:\n` +
            problems.map((p) => `  • ${p}`).join('\n') +
            `\n\nSee docs/ADOPTION.md for a minimal working adapter.`);
        this.name = 'BlogEngineConfigError';
        this.problems = problems;
    }
}
const isHttpUrl = (v) => {
    try {
        return /^https?:$/.test(new URL(v).protocol);
    }
    catch {
        return false;
    }
};
/**
 * Returns the list of problems (empty when the runtime is usable). Exported so an adapter can
 * lint itself in CI without configuring the engine.
 */
export function validateBlogEngineRuntime(runtime) {
    const problems = [];
    const config = runtime?.config;
    const topics = runtime?.topics;
    if (!config)
        return ['config is missing — pass { config, topics, brandPersona }'];
    if (!topics)
        problems.push('topics is missing — pass { config, topics, brandPersona }');
    if (typeof runtime.brandPersona !== 'function') {
        problems.push('brandPersona must be a function returning the system persona string');
    }
    /* ------------------------------------------------------------------ identity --- */
    const id = config.identity;
    if (!id)
        problems.push('identity is missing');
    else {
        if (!id.name?.trim())
            problems.push('identity.name is required (the brand name)');
        if (!id.siteUrl?.trim() || !isHttpUrl(id.siteUrl)) {
            problems.push(`identity.siteUrl must be an absolute http(s) URL (got ${JSON.stringify(id.siteUrl)})`);
        }
        if (!id.siteHost?.trim())
            problems.push('identity.siteHost is required (e.g. "example.com", no scheme)');
        else if (/^https?:\/\//.test(id.siteHost))
            problems.push('identity.siteHost must be a bare host, without https://');
        if (!id.agent?.name?.trim())
            problems.push('identity.agent.name is required (use the brand name if there is no named person)');
        if (id.backlink && !isHttpUrl(id.backlink.url)) {
            problems.push('identity.backlink.url must be an absolute http(s) URL');
        }
        if (id.ctaPath && !id.ctaPath.startsWith('/'))
            problems.push('identity.ctaPath must be a site-relative path starting with "/"');
    }
    /* --------------------------------------------------------------------- paths --- */
    const paths = config.paths;
    if (!paths)
        problems.push('paths is missing');
    else {
        for (const key of ['blogDir', 'assetDir', 'heroDir', 'brandLogo', 'watermarkLogo']) {
            if (!paths[key]?.trim())
                problems.push(`paths.${key} is required`);
        }
    }
    /* -------------------------------------------------------------------- topics --- */
    if (topics) {
        // These three are indexed modulo their length; empty means a divide-by-zero index and an
        // undefined read deep in the pipeline, so they are hard errors rather than warnings.
        if (!topics.allowedCategories?.length) {
            problems.push('topics.allowedCategories must contain at least one category — every generated post is validated against it');
        }
        if (!topics.editorial?.length) {
            problems.push('topics.editorial must contain at least one topic — it is the fallback when Search Console has nothing new');
        }
        if (!topics.internalLinks?.length) {
            problems.push('topics.internalLinks must contain at least one path — posts are required to link internally, so an empty list can never validate');
        }
        else {
            const bad = topics.internalLinks.filter((l) => !l.startsWith('/'));
            if (bad.length)
                problems.push(`topics.internalLinks must be site-relative paths starting with "/" (got ${bad.slice(0, 3).join(', ')})`);
        }
        if (!topics.gradients?.length)
            problems.push('topics.gradients must contain at least one value (used to theme cards)');
        if (!topics.heroPhotos?.length) {
            problems.push('topics.heroPhotos must contain at least one fallback photo — it is what ships when image generation is unavailable or fails');
        }
        if (topics.crossPromo?.length && !config.identity?.backlink) {
            problems.push('topics.crossPromo is set but identity.backlink is not — cross-promo posts need somewhere to link, and will be skipped');
        }
        const cats = new Set(topics.allowedCategories ?? []);
        const strayEditorial = (topics.editorial ?? []).filter((t) => t.category && !cats.has(t.category));
        if (strayEditorial.length) {
            problems.push(`topics.editorial has categories missing from allowedCategories: ${[...new Set(strayEditorial.map((t) => t.category))].join(', ')}`);
        }
    }
    /* ---------------------------------------------------------------------- misc --- */
    if (!config.rss?.path?.startsWith('/'))
        problems.push('rss.path must be a site-relative path starting with "/"');
    if (config.gsc && !config.gsc.property?.trim())
        problems.push('gsc.property is required (e.g. "sc-domain:example.com")');
    if (config.image?.og && config.image.og.enabled !== false) {
        if (!config.image.og.width || !config.image.og.height)
            problems.push('image.og.width/height are required unless image.og.enabled is false');
    }
    return problems;
}
/** Throws a single, readable error listing everything wrong with the adapter. */
export function assertBlogEngineRuntime(runtime) {
    const problems = validateBlogEngineRuntime(runtime);
    if (problems.length)
        throw new BlogEngineConfigError(problems);
}
//# sourceMappingURL=validate-runtime.js.map