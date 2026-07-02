#!/usr/bin/env tsx
import { BLOG_CONFIG, getGoogleAccessToken, pingGscSitemap, pingIndexNow } from '../../src';
import { configureSdbgBlogEngine } from './runtime';

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function cleanSlugs(raw: string | undefined): string[] {
  return Array.from(
    new Set(
      (raw || '')
        .split(/[,\s]+/)
        .map((slug) => slug.trim().replace(/^\/?blog\//, '').replace(/\/$/, ''))
        .filter(Boolean)
        .filter((slug) => /^[a-z0-9-]+$/.test(slug)),
    ),
  );
}

const slugs = cleanSlugs(parseArg('slugs') || process.env.BLOG_SLUGS);
const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';
const waitForLive = process.argv.includes('--wait-live') || process.env.WAIT_FOR_LIVE === '1';
configureSdbgBlogEngine();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilLive(urls: string[]): Promise<void> {
  const deadline = Date.now() + 10 * 60 * 1000;
  const pending = new Set(urls);

  while (pending.size && Date.now() < deadline) {
    await Promise.all(
      Array.from(pending).map(async (url) => {
        try {
          const response = await fetch(url, { redirect: 'follow' });
          if (response.ok) pending.delete(url);
        } catch {
          // Retry until the deadline. Vercel may still be promoting the build.
        }
      }),
    );

    if (pending.size) {
      console.log(`[blog-indexing] Waiting for ${pending.size} URL(s) to go live...`);
      await sleep(15000);
    }
  }

  if (pending.size) {
    throw new Error(`Timed out waiting for live blog URL(s): ${Array.from(pending).join(', ')}`);
  }
}

if (process.env.BLOG_ENGINE_DISABLED === '1') {
  console.log('[blog-indexing] BLOG_ENGINE_DISABLED=1 - exiting.');
  process.exit(0);
}

if (!slugs.length) {
  console.log('[blog-indexing] No changed blog slugs found.');
  process.exit(0);
}

const urls = slugs.map((slug) => `${BLOG_CONFIG.identity.siteUrl}/blog/${slug}`);
if (dryRun) {
  console.log(`[blog-indexing] Dry run: would submit ${urls.length} live URL(s): ${urls.join(', ')}`);
  process.exit(0);
}

if (waitForLive) {
  await waitUntilLive(urls);
}

await pingIndexNow(urls);

if (
  process.env.GOOGLE_OAUTH_CLIENT_ID &&
  process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
  process.env.GOOGLE_OAUTH_REFRESH_TOKEN
) {
  try {
    await pingGscSitemap(await getGoogleAccessToken());
  } catch (err) {
    console.warn('[blog-indexing] GSC sitemap resubmit skipped:', err instanceof Error ? err.message : String(err));
  }
}

console.log(`[blog-indexing] Submitted ${urls.length} live URL(s): ${urls.join(', ')}`);
