import { BLOG_CONFIG, getBlogHooks } from './config.js';
import { env, norm } from './utils.js';
import type { GscQuery } from './types.js';

const LOOKBACK_DAYS = 28;

/**
 * The engine's topic-candidate invariants, applied to EVERY source (built-in reader or a
 * fetchGscQueries hook): drop single-word queries, drop anything containing a brand term (we
 * already own those), and rank by impressions.
 */
function filterQueries(rows: GscQuery[]): GscQuery[] {
  const brandStopwords = [
    BLOG_CONFIG.identity.name.toLowerCase(),
    BLOG_CONFIG.identity.siteHost.replace(/\.[a-z]+$/, ''),
    BLOG_CONFIG.identity.agent.name.toLowerCase(),
    BLOG_CONFIG.identity.voice.name.toLowerCase(),
  ];
  return rows
    .filter((q) => q.query.split(/\s+/).length >= 2)
    .filter((q) => !brandStopwords.some((b) => norm(q.query).includes(norm(b))))
    .sort((a, b) => b.impressions - a.impressions);
}

export async function getGoogleAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: env('GOOGLE_OAUTH_CLIENT_ID'),
    client_secret: env('GOOGLE_OAUTH_CLIENT_SECRET'),
    refresh_token: env('GOOGLE_OAUTH_REFRESH_TOKEN'),
    grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const j = await r.json();
  if (!j.access_token) throw new Error('Google token exchange failed: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

export async function getGscQueries(): Promise<{ token: string | null; queries: GscQuery[] }> {
  // A site that authenticates Search Console its own way (service account, or any other analytics
  // source) supplies candidates here. No OAuth token exists in that case, so sitemap submission
  // routes through the submitSitemap hook instead.
  const hook = getBlogHooks().fetchGscQueries;
  if (hook) {
    try {
      const rows = await hook({
        property: BLOG_CONFIG.gsc.property,
        siteUrl: BLOG_CONFIG.identity.siteUrl,
        days: LOOKBACK_DAYS,
      });
      return { token: null, queries: filterQueries(rows || []) };
    } catch (err) {
      console.warn('[blog-gsc] fetchGscQueries hook failed, falling back to editorial pool:', err instanceof Error ? err.message : String(err));
      return { token: null, queries: [] };
    }
  }

  if (
    !process.env.GOOGLE_OAUTH_CLIENT_ID ||
    !process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
    !process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  ) {
    return { token: null, queries: [] };
  }

  const token = await getGoogleAccessToken();
  const end = new Date();
  const start = new Date(end.getTime() - LOOKBACK_DAYS * 864e5);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  try {
    const r = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(BLOG_CONFIG.gsc.property)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: fmt(start),
          endDate: fmt(end),
          dimensions: ['query'],
          rowLimit: 60,
        }),
      },
    );
    const j = await r.json();
    const queries = filterQueries(
      (j.rows || []).map((row: { keys: string[]; impressions: number }) => ({
        query: row.keys[0],
        impressions: row.impressions,
      })),
    );
    return { token, queries };
  } catch (err) {
    console.warn('[blog-gsc] query fetch failed, falling back to editorial pool:', err instanceof Error ? err.message : String(err));
    return { token, queries: [] };
  }
}

export async function pingGscSitemap(token: string | null): Promise<void> {
  // A site with its own Search Console auth submits through the hook; there is no OAuth token.
  const hook = getBlogHooks().submitSitemap;
  if (hook) {
    try {
      await hook({ sitemap: BLOG_CONFIG.gsc.sitemap, property: BLOG_CONFIG.gsc.property });
      console.log('[blog-indexing] GSC sitemap resubmit: via submitSitemap hook');
    } catch (err) {
      console.warn('[blog-indexing] submitSitemap hook failed:', err instanceof Error ? err.message : String(err));
    }
    return;
  }
  if (!token) return;
  try {
    const sm = encodeURIComponent(BLOG_CONFIG.gsc.sitemap);
    const r = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(BLOG_CONFIG.gsc.property)}/sitemaps/${sm}`,
      { method: 'PUT', headers: { Authorization: `Bearer ${token}` } },
    );
    console.log('[blog-indexing] GSC sitemap resubmit:', r.status);
  } catch (err) {
    console.warn('[blog-indexing] GSC sitemap ping failed:', err instanceof Error ? err.message : String(err));
  }
}
