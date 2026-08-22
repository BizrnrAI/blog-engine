import { writeFileSync } from 'node:fs';
import { BLOG_CONFIG, blogBasePath, configureBlogEngine, getBlogHooks } from './config.js';
import { generateBlogRun } from './publisher.js';
import { refreshBlogRun } from './refresh.js';
import { auditBlogCorpus, formatAuditReport } from './audit.js';
import { getGoogleAccessToken, pingGscSitemap } from './gsc.js';
import { pingIndexNow } from './indexing.js';
import type { BlogEngineRuntime } from './types.js';

function parseArg(name: string, argv = process.argv): string | undefined {
  const prefix = `--${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

export function cleanBlogSlugs(raw: string | undefined): string[] {
  return Array.from(
    new Set(
      (raw || '')
        .split(/[,\s]+/)
        .map((slug) => slug.trim().replace(/^\/?[a-z0-9-]+\//, '').replace(/\/$/, ''))
        .filter(Boolean)
        .filter((slug) => /^[a-z0-9-]+$/.test(slug)),
    ),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitUntilBlogUrlsLive(urls: string[], timeoutMs = 10 * 60 * 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const pending = new Set(urls);

  while (pending.size && Date.now() < deadline) {
    await Promise.all(
      Array.from(pending).map(async (url) => {
        try {
          const response = await fetch(url, { redirect: 'follow' });
          if (response.ok) pending.delete(url);
        } catch {
          // Deploys may still be promoting. Retry until deadline.
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

export async function runBlogGenerateCli(runtime: BlogEngineRuntime, root = process.cwd()): Promise<void> {
  const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';
  const count = Math.max(1, Number(parseArg('count') || '1') || 1);
  const skipPing = process.argv.includes('--skip-ping') || process.env.SKIP_PING === '1';

  configureBlogEngine(runtime);
  const result = await generateBlogRun(root, { count, dryRun, skipPing });

  if (process.env.GITHUB_OUTPUT && result.written.length) {
    writeFileSync(process.env.GITHUB_OUTPUT, `slugs=${result.written.join(',')}\n`, { flag: 'a' });
  }

  if (!dryRun && result.written.length === 0 && !result.skipped) {
    process.exitCode = 1;
  }
}

export async function runBlogIndexPublishedCli(runtime: BlogEngineRuntime): Promise<void> {
  configureBlogEngine(runtime);

  const slugs = cleanBlogSlugs(parseArg('slugs') || process.env.BLOG_SLUGS);
  const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';
  const waitForLive = process.argv.includes('--wait-live') || process.env.WAIT_FOR_LIVE === '1';

  if (process.env.BLOG_ENGINE_DISABLED === '1') {
    console.log('[blog-indexing] BLOG_ENGINE_DISABLED=1 - exiting.');
    return;
  }

  if (!slugs.length) {
    console.log('[blog-indexing] No changed blog slugs found.');
    return;
  }

  const urls = slugs.map((slug) => `${BLOG_CONFIG.identity.siteUrl}${blogBasePath()}/${slug}`);

  if (dryRun) {
    console.log(`[blog-indexing] Dry run: would submit ${urls.length} live URL(s): ${urls.join(', ')}`);
    return;
  }

  if (waitForLive) await waitUntilBlogUrlsLive(urls);

  await pingIndexNow(urls);

  // A submitSitemap hook owns its own auth, so it needs no OAuth token (pingGscSitemap routes to it).
  if (getBlogHooks().submitSitemap) {
    await pingGscSitemap(null);
  } else if (
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

  // Distribution seam: syndication runs only after URLs are live + submitted, and never blocks.
  const afterIndexed = getBlogHooks().afterIndexed;
  if (afterIndexed) {
    try {
      await afterIndexed({ urls, slugs });
    } catch (err) {
      console.warn('[blog-indexing] afterIndexed hook failed (publish unaffected):', err instanceof Error ? err.message : String(err));
    }
  }
}

/**
 * Refresh mode CLI: `--slugs=a,b` to force, otherwise rank rescue picks up to `--max=N` (default 1)
 * posts at position 8–30 from Search Console. Writes `slugs=` to GITHUB_OUTPUT for PR flows.
 */
export async function runBlogRefreshCli(runtime: BlogEngineRuntime, root = process.cwd()): Promise<void> {
  configureBlogEngine(runtime);
  const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';
  const slugs = cleanBlogSlugs(parseArg('slugs') || process.env.BLOG_SLUGS);
  const max = Math.max(1, Number(parseArg('max') || '1') || 1);
  const result = await refreshBlogRun(root, { slugs, max, dryRun });
  if (result.candidates.length) {
    console.log('[blog-refresh] rank-rescue candidates (top 10):');
    for (const c of result.candidates.slice(0, 10)) {
      console.log(`  ${c.action.padEnd(16)} ${c.slug.padEnd(50)} pos ${String(c.position).padStart(5)}  impr ${String(c.impressions).padStart(6)}  ctr ${(c.ctr * 100).toFixed(1)}%  score ${c.score}`);
    }
  }
  if (process.env.GITHUB_OUTPUT && result.refreshed.length) {
    writeFileSync(process.env.GITHUB_OUTPUT, `slugs=${result.refreshed.join(',')}\n`, { flag: 'a' });
  }
}

/** Corpus audit CLI: prints SHIP/FIX/BLOCK per post; `--json` for machine output; `--strict` exits 1 on any BLOCK. */
export async function runBlogAuditCli(runtime: BlogEngineRuntime, root = process.cwd()): Promise<void> {
  configureBlogEngine(runtime);
  const entries = auditBlogCorpus(root, { staleAfterDays: Number(parseArg('stale-days') || '365') || 365 });
  if (process.argv.includes('--json')) console.log(JSON.stringify(entries, null, 2));
  else console.log(formatAuditReport(entries));
  if (process.argv.includes('--strict') && entries.some((e) => e.verdict === 'BLOCK')) process.exitCode = 1;
}
