import { BLOG_CONFIG, getBlogHooks } from './config.js';
import { getGoogleAccessToken } from './gsc.js';

/** Verify the actual URL, not a redirect to a homepage or login page. */
export async function waitUntilBlogUrlsLive(urls: string[], timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const pending = new Set(urls);
  do {
    await Promise.all([...pending].map(async (url) => {
      try {
        const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(Math.max(1, Math.min(8_000, deadline - Date.now()))) });
        await r.body?.cancel();
        if (r.status === 200) pending.delete(url);
      } catch { /* Retry within the bounded live-publication window. */ }
    }));
    if (!pending.size) return;
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(3_000, deadline - Date.now())));
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for live blog URL(s): ${[...pending].join(', ')}`);
}

export async function indexingToken(): Promise<string | null> {
  if (getBlogHooks().submitSitemap) return null;
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET || !process.env.GOOGLE_OAUTH_REFRESH_TOKEN) return null;
  return getGoogleAccessToken();
}

export async function pingIndexNow(urls: string[]): Promise<void> {
  const key = process.env.INDEXNOW_KEY || BLOG_CONFIG.indexNow.key;
  if (!urls.length || !key) return;
  await waitUntilBlogUrlsLive(urls);
  try {
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: BLOG_CONFIG.identity.siteHost,
        key,
        keyLocation: `${BLOG_CONFIG.identity.siteUrl}/${key}.txt`,
        urlList: urls,
      }),
    });
    console.log('[blog-indexing] IndexNow:', r.status);
    if (!r.ok) throw new Error(`IndexNow rejected submission: HTTP ${r.status}`);
  } catch (err) {
    console.warn('[blog-indexing] IndexNow ping failed:', err instanceof Error ? err.message : String(err));
    throw err;
  }
}
