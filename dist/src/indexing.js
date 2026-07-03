import { BLOG_CONFIG } from './config.js';
export async function pingIndexNow(urls) {
    const key = process.env.INDEXNOW_KEY || BLOG_CONFIG.indexNow.key;
    try {
        const r = await fetch('https://api.indexnow.org/indexnow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                host: BLOG_CONFIG.identity.siteHost,
                key,
                keyLocation: `${BLOG_CONFIG.identity.siteUrl}/${key}.txt`,
                urlList: urls,
            }),
        });
        console.log('[blog-indexing] IndexNow:', r.status);
    }
    catch (err) {
        console.warn('[blog-indexing] IndexNow ping failed:', err instanceof Error ? err.message : String(err));
    }
}
//# sourceMappingURL=indexing.js.map