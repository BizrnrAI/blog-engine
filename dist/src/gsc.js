import { BLOG_CONFIG } from './config';
import { env, norm } from './utils';
export async function getGoogleAccessToken() {
    const body = new URLSearchParams({
        client_id: env('GOOGLE_OAUTH_CLIENT_ID'),
        client_secret: env('GOOGLE_OAUTH_CLIENT_SECRET'),
        refresh_token: env('GOOGLE_OAUTH_REFRESH_TOKEN'),
        grant_type: 'refresh_token',
    });
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
    const j = await r.json();
    if (!j.access_token)
        throw new Error('Google token exchange failed: ' + JSON.stringify(j).slice(0, 200));
    return j.access_token;
}
const BRAND_STOPWORDS = [
    BLOG_CONFIG.identity.name.toLowerCase(),
    BLOG_CONFIG.identity.siteHost.replace(/\.[a-z]+$/, ''),
    BLOG_CONFIG.identity.agent.name.toLowerCase(),
    BLOG_CONFIG.identity.voice.name.toLowerCase(),
];
export async function getGscQueries() {
    if (!process.env.GOOGLE_OAUTH_CLIENT_ID ||
        !process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
        !process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
        return { token: null, queries: [] };
    }
    const token = await getGoogleAccessToken();
    const end = new Date();
    const start = new Date(end.getTime() - 28 * 864e5);
    const fmt = (d) => d.toISOString().slice(0, 10);
    try {
        const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(BLOG_CONFIG.gsc.property)}/searchAnalytics/query`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                startDate: fmt(start),
                endDate: fmt(end),
                dimensions: ['query'],
                rowLimit: 60,
            }),
        });
        const j = await r.json();
        const queries = (j.rows || [])
            .map((row) => ({
            query: row.keys[0],
            impressions: row.impressions,
        }))
            .filter((q) => q.query.split(/\s+/).length >= 2)
            .filter((q) => !BRAND_STOPWORDS.some((b) => norm(q.query).includes(norm(b))))
            .sort((a, b) => b.impressions - a.impressions);
        return { token, queries };
    }
    catch (err) {
        console.warn('[blog-gsc] query fetch failed, falling back to editorial pool:', err instanceof Error ? err.message : String(err));
        return { token, queries: [] };
    }
}
export async function pingGscSitemap(token) {
    if (!token)
        return;
    try {
        const sm = encodeURIComponent(BLOG_CONFIG.gsc.sitemap);
        const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(BLOG_CONFIG.gsc.property)}/sitemaps/${sm}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
        console.log('[blog-indexing] GSC sitemap resubmit:', r.status);
    }
    catch (err) {
        console.warn('[blog-indexing] GSC sitemap ping failed:', err instanceof Error ? err.message : String(err));
    }
}
//# sourceMappingURL=gsc.js.map