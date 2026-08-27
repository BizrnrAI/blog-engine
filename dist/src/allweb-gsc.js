async function request(options, body) {
    if (!options.apiUrl || !options.token || !options.siteId) {
        throw new Error('AllWeb GSC hooks require apiUrl, token, and siteId');
    }
    const response = await fetch(options.apiUrl, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${options.token}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({ ...body, site_id: options.siteId }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
        throw new Error(`AllWeb GSC request failed (${response.status}): ${payload.error ?? 'unknown'}`);
    }
    if (payload.site_id && payload.site_id !== options.siteId) {
        throw new Error('AllWeb GSC response crossed the configured site boundary');
    }
    return payload;
}
/**
 * Site-scoped Search Console hooks. Google credentials remain in AllWeb's
 * server environment; the repository receives only its delegated site token.
 */
export function createAllWebGscHooks(options) {
    return {
        async fetchGscQueries({ days }) {
            const payload = await request(options, { action: 'gsc_queries', days });
            return (payload.queries ?? []);
        },
        async fetchGscPageQueries({ days, pathPrefix }) {
            const payload = await request(options, {
                action: 'gsc_page_queries',
                days,
                path_prefix: pathPrefix,
            });
            return (payload.rows ?? []);
        },
        async submitSitemap({ sitemap }) {
            await request(options, { action: 'gsc_submit_sitemaps', sitemaps: [sitemap] });
        },
    };
}
//# sourceMappingURL=allweb-gsc.js.map