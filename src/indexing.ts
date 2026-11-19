import { BLOG_CONFIG, blogPostUrl, getBlogHooks } from './config.js';
import { getGoogleAccessToken, hasGoogleOAuth, submitGscSitemaps } from './gsc.js';
import { liveBlogPageProblems, readBlogHtml, type LiveBlogPageOptions } from './live-page.js';
import type { ParsedBlogPost } from './types.js';

type Target = { url: string } & LiveBlogPageOptions;

async function probe(target: Target, timeoutMs: number): Promise<string[]> {
  try {
    const response = await fetch(target.url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    if (response.status !== 200) {
      await response.body?.cancel();
      return [`HTTP ${response.status}`];
    }
    return liveBlogPageProblems(target.url, response, await readBlogHtml(response), target);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

async function checkLiveTargets(targets: Target[], timeoutMs: number) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new Error('Invalid live verification timeout');
  const deadline = Date.now() + timeoutMs;
  const pending = new Map(targets.map((target) => [target.url, target]));
  const reasons = new Map<string, string[]>();
  do {
    const entries = [...pending];
    for (let i = 0; i < entries.length; i += 8) {
      await Promise.all(entries.slice(i, i + 8).map(async ([url, target]) => {
        const problems = await probe(target, Math.max(1, Math.min(8_000, deadline - Date.now())));
        if (problems.length) reasons.set(url, problems);
        else {
          reasons.delete(url);
          pending.delete(url);
        }
      }));
    }
    if (!pending.size || Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.min(3_000, deadline - Date.now()))));
  } while (Date.now() < deadline);
  return {
    live: targets.filter(({ url }) => !pending.has(url)).map(({ url }) => url),
    pending: [...pending.keys()].map((url) => `${url} (${reasons.get(url)?.join(', ')})`),
  };
}

/** Verify canonical URLs without following a redirect to a homepage or login page. */
export async function waitUntilBlogUrlsLive(urls: string[], timeoutMs = 60_000): Promise<void> {
  const { pending } = await checkLiveTargets(urls.map((url) => ({ url })), timeoutMs);
  if (pending.length) throw new Error(`Timed out waiting for live blog URL(s): ${pending.join(', ')}`);
}

export async function indexingToken(): Promise<string | null> {
  if (getBlogHooks().submitSitemap) return null;
  if (!hasGoogleOAuth()) return null;
  return getGoogleAccessToken();
}

function indexNowKey(): string {
  return process.env.INDEXNOW_KEY || BLOG_CONFIG.indexNow.key;
}

async function submitIndexNow(urls: string[], key: string): Promise<'accepted' | 'key-validation-pending'> {
  const origin = new URL(BLOG_CONFIG.identity.siteUrl).origin;
  if (urls.some((url) => new URL(url).origin !== origin)) throw new Error('IndexNow URLs must match the configured site origin');
  let validationPending = false;
  for (let i = 0; i < urls.length; i += 10_000) {
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: new URL(origin).host,
        key,
        keyLocation: new URL(`/${encodeURIComponent(key)}.txt`, origin).href,
        urlList: urls.slice(i, i + 10_000),
      }),
    });
    await response.body?.cancel();
    if (response.status !== 200 && response.status !== 202) throw new Error(`IndexNow rejected submission: HTTP ${response.status}`);
    validationPending ||= response.status === 202;
  }
  return validationPending ? 'key-validation-pending' : 'accepted';
}

export async function pingIndexNow(urls: string[]): Promise<void> {
  const key = indexNowKey();
  if (!urls.length || !key) return;
  await waitUntilBlogUrlsLive(urls);
  console.log('[blog-indexing] IndexNow:', await submitIndexNow([...new Set(urls)], key));
}

export interface DiscoverySubmissionOptions {
  /** Published content used to test for a current H1 and quick answer in strict mode. */
  posts?: readonly Pick<ParsedBlogPost, 'slug' | 'title' | 'answer'>[];
  timeoutMs?: number;
  /** Reuse the Search Console query token when available. */
  googleToken?: string | null;
  /** Run the distribution hook after discovery succeeds. Default true. */
  notify?: boolean;
}

export interface DiscoverySubmissionResult {
  liveUrls: string[];
  indexNow: 'accepted' | 'key-validation-pending' | 'skipped';
  submittedSitemaps: string[];
}

/** Verify once, submit independent provider signals, and report failures without losing ready URLs. */
export async function submitBlogDiscovery(slugs: readonly string[], options: DiscoverySubmissionOptions = {}): Promise<DiscoverySubmissionResult> {
  const posts = new Map(options.posts?.map((post) => [post.slug, post]));
  const urls = new Map([...new Set(slugs)].map((slug) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`Invalid published slug: ${slug}`);
    return [blogPostUrl(slug), slug];
  }));
  const strict = BLOG_CONFIG.indexing?.requireCanonicalHtml === true;
  const targets = [...urls].map(([url, slug]) => ({
    url,
    requireCanonicalHtml: strict,
    ...(strict ? { title: posts.get(slug)?.title, answer: posts.get(slug)?.answer } : {}),
  }));
  const { live, pending } = await checkLiveTargets(targets, options.timeoutMs ?? 60_000);
  const result: DiscoverySubmissionResult = { liveUrls: live, indexNow: 'skipped', submittedSitemaps: [] };
  const failures = pending.length ? [`Timed out waiting for live blog URL(s): ${pending.join(', ')}`] : [];
  if (live.length) {
    const key = indexNowKey();
    const [indexNow, google] = await Promise.allSettled([
      key ? submitIndexNow(live, key) : Promise.resolve('skipped' as const),
      (async () => submitGscSitemaps(options.googleToken || await indexingToken()))(),
    ]);
    if (indexNow.status === 'fulfilled') result.indexNow = indexNow.value;
    else failures.push(`IndexNow: ${errorMessage(indexNow.reason)}`);
    if (google.status === 'fulfilled') result.submittedSitemaps = google.value;
    else failures.push(`Search Console: ${errorMessage(google.reason)}`);
    console.log(`[blog-indexing] ${live.length} live, IndexNow ${result.indexNow}, ${result.submittedSitemaps.length} sitemap(s) accepted`);

    const afterIndexed = getBlogHooks().afterIndexed;
    if (!failures.length && options.notify !== false && afterIndexed) {
      try { await afterIndexed({ urls: live, slugs: live.map((url) => urls.get(url)!) }); }
      catch (error) { console.warn('[blog-indexing] afterIndexed failed:', errorMessage(error)); }
    }
  }
  if (failures.length) throw new Error(failures.join(' | '));
  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
