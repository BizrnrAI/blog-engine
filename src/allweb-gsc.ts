import type { BlogEngineHooks, GscPageQuery, GscQuery } from './types.js';

export interface AllWebGscOptions {
  apiUrl: string;
  token: string;
  siteId: string;
  timeoutMs?: number;
}

async function request(
  options: AllWebGscOptions,
  body: Record<string, unknown>,
): Promise<Record<string, any>> {
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
export function createAllWebGscHooks(
  options: AllWebGscOptions,
): Pick<BlogEngineHooks, 'fetchGscQueries' | 'fetchGscPageQueries' | 'submitSitemap'> {
  return {
    async fetchGscQueries({ days }) {
      const payload = await request(options, { action: 'gsc_queries', days });
      return (payload.queries ?? []) as GscQuery[];
    },
    async fetchGscPageQueries({ days, pathPrefix }) {
      const payload = await request(options, {
        action: 'gsc_page_queries',
        days,
        path_prefix: pathPrefix,
      });
      return (payload.rows ?? []) as GscPageQuery[];
    },
    async submitSitemap({ sitemap }) {
      await request(options, { action: 'gsc_submit_sitemaps', sitemaps: [sitemap] });
    },
  };
}
