import { BLOG_CONFIG, blogBasePath, getBlogHooks, getBlogTopics } from './config.js';
import { env, norm } from './utils.js';
import type { GscPageQuery, GscQuery } from './types.js';

const LOOKBACK_DAYS = 28;
/**
 * Search Console finalizes data on a lag. Ending a window at "today" mixes fresh partial days
 * with final ones, so every period-over-period comparison silently understates the recent side.
 * Anchor on the newest day that is actually final instead.
 */
const FINAL_DATA_LAG_DAYS = 3;

/**
 * The engine's topic-candidate invariants, applied to EVERY source (built-in reader or a
 * fetchGscQueries hook): drop single-word queries, drop anything containing a brand term (we
 * already own those), and rank by impressions.
 */
function filterQueries(rows: GscQuery[]): GscQuery[] {
  // agent/voice are optional identity fields; only the ones a site actually configured count.
  const brandStopwords = [
    BLOG_CONFIG.identity.name,
    BLOG_CONFIG.identity.siteHost.replace(/\.[a-z]+$/, ''),
    BLOG_CONFIG.identity.agent?.name,
    BLOG_CONFIG.identity.voice?.name,
  ]
    .filter((s): s is string => Boolean(s))
    .map((s) => s.toLowerCase());
  const exclude = getBlogTopics().excludeQuery;
  return rows
    .filter((q) => q.query.split(/\s+/).length >= 2)
    .filter((q) => !brandStopwords.some((b) => norm(q.query).includes(norm(b))))
    .filter((q) => !(exclude && exclude(q.query)))
    .sort((a, b) => b.impressions - a.impressions);
}

function querySourceFailure(message: string, err?: unknown): { token: null; queries: GscQuery[] } {
  const detail = err === undefined ? '' : `: ${err instanceof Error ? err.message : String(err)}`;
  const full = `${message}${detail}`;
  if (BLOG_CONFIG.gsc.requireQuerySource) throw new Error(full, err === undefined ? undefined : { cause: err });
  console.warn(`[blog-gsc] ${full}; falling back to editorial pool`);
  return { token: null, queries: [] };
}

function assertQueryRows(rows: unknown): asserts rows is GscQuery[] {
  if (!Array.isArray(rows)) throw new Error('query source returned a non-array payload');
  const invalid = rows.findIndex((row) =>
    !row || typeof row.query !== 'string' || !row.query.trim() ||
    typeof row.impressions !== 'number' || !Number.isFinite(row.impressions) || row.impressions < 0,
  );
  if (invalid !== -1) throw new Error(`query source returned an invalid row at index ${invalid}`);
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
      assertQueryRows(rows);
      return { token: null, queries: filterQueries(rows) };
    } catch (err) {
      return querySourceFailure('fetchGscQueries hook failed', err);
    }
  }

  if (
    !process.env.GOOGLE_OAUTH_CLIENT_ID ||
    !process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
    !process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  ) {
    return querySourceFailure('no fetchGscQueries hook or Google OAuth credentials are configured');
  }

  const token = await getGoogleAccessToken();
  const end = new Date(Date.now() - FINAL_DATA_LAG_DAYS * 864e5);
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
          dataState: 'final',
        }),
      },
    );
    if (!r.ok) throw new Error(`Search Console query request failed with HTTP ${r.status}`);
    const j = await r.json();
    if (j.rows !== undefined && !Array.isArray(j.rows)) throw new Error('Search Console returned a non-array rows payload');
    const queries = filterQueries(
      (j.rows || []).map((row: { keys: string[]; impressions: number }) => ({
        query: row.keys[0],
        impressions: row.impressions,
      })),
    );
    return { token, queries };
  } catch (err) {
    const fallback = querySourceFailure('Search Console query fetch failed', err);
    return { token, queries: fallback.queries };
  }
}

/**
 * Page × query rows for posts under pathPrefix (default '/blog/'), 28-day window. Used by rank
 * rescue and refresh mode. Returns [] (never throws) when Search Console is not configured.
 */
export async function getGscPageQueries(pathPrefix?: string): Promise<GscPageQuery[]> {
  pathPrefix = pathPrefix || `${blogBasePath()}/`;
  const hook = getBlogHooks().fetchGscPageQueries;
  if (hook) {
    try {
      return (await hook({ property: BLOG_CONFIG.gsc.property, siteUrl: BLOG_CONFIG.identity.siteUrl, days: LOOKBACK_DAYS, pathPrefix })) || [];
    } catch (err) {
      console.warn('[blog-gsc] fetchGscPageQueries hook failed:', err instanceof Error ? err.message : String(err));
      return [];
    }
  }
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET || !process.env.GOOGLE_OAUTH_REFRESH_TOKEN) return [];
  try {
    const token = await getGoogleAccessToken();
    const end = new Date(Date.now() - FINAL_DATA_LAG_DAYS * 864e5);
    const start = new Date(end.getTime() - LOOKBACK_DAYS * 864e5);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const r = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(BLOG_CONFIG.gsc.property)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: fmt(start),
          endDate: fmt(end),
          dimensions: ['page', 'query'],
          rowLimit: 2500,
          dataState: 'final',
          dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'contains', expression: pathPrefix }] }],
        }),
      },
    );
    const j = await r.json();
    return (j.rows || []).map((row: { keys: string[]; impressions: number; clicks: number; position: number }) => ({
      page: row.keys[0],
      query: row.keys[1],
      impressions: row.impressions,
      clicks: row.clicks,
      position: row.position,
    }));
  } catch (err) {
    console.warn('[blog-gsc] page/query fetch failed:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function pingGscSitemap(token: string | null): Promise<void> {
  const sitemaps = [...new Set([
    BLOG_CONFIG.gsc.sitemap,
    ...(BLOG_CONFIG.gsc.sitemaps ?? []),
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
  // A site with its own Search Console auth submits through the hook; there is no OAuth token.
  const hook = getBlogHooks().submitSitemap;
  if (hook) {
    for (const sitemap of sitemaps) {
      try {
        await hook({ sitemap, property: BLOG_CONFIG.gsc.property });
        console.log('[blog-indexing] GSC sitemap resubmit via hook:', sitemap);
      } catch (err) {
        console.warn('[blog-indexing] submitSitemap hook failed:', sitemap, err instanceof Error ? err.message : String(err));
      }
    }
    return;
  }
  if (!token) return;
  for (const sitemap of sitemaps) {
    try {
      const sm = encodeURIComponent(sitemap);
      const r = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(BLOG_CONFIG.gsc.property)}/sitemaps/${sm}`,
        { method: 'PUT', headers: { Authorization: `Bearer ${token}` } },
      );
      console.log('[blog-indexing] GSC sitemap resubmit:', sitemap, r.status);
    } catch (err) {
      console.warn('[blog-indexing] GSC sitemap ping failed:', sitemap, err instanceof Error ? err.message : String(err));
    }
  }
}
