import type {
  AllWebReviewer,
  AllWebReviewerOptions,
  ReviewedAllWebPost,
  ReleaseReviewedAllWebPostArgs,
  ReleaseReviewedAllWebPostResult,
} from './types.js';

const REVIEWER_PERMISSIONS = ['blog:publish', 'blog:read', 'site:read'] as const;

/**
 * Release client for review-required sites.
 *
 * Generation credentials deliberately cannot call this path. The reviewer token is checked
 * against both the manifest tenant and the exact three-permission role before the candidate is
 * read. Publication uses the revision the reviewer inspected, so a concurrent edit fails rather
 * than releasing different words. Re-running after an indexing outage is safe: a published row
 * at expectedRevision + 1 is treated as the completed first half of the same operation.
 */
export function createAllWebReviewer(options: AllWebReviewerOptions): AllWebReviewer {
  const apiUrl = required(options.apiUrl, 'apiUrl');
  const token = required(options.token, 'token');
  const siteId = required(options.siteId, 'siteId');
  const timeoutMs = boundedInteger(options.timeoutMs, 100, 60_000, 8_000, 'timeoutMs');

  async function call(body: Record<string, unknown>): Promise<Record<string, any>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({})) as Record<string, any>;
      if (!response.ok || result.ok !== true) {
        const error = new Error(`AllWeb ${String(body.action)} ${response.status}: ${String(result.error || 'request_failed')}`);
        Object.assign(error, { status: response.status, code: result.error });
        throw error;
      }
      return result;
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new Error(`AllWeb ${String(body.action)} timed out after ${timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function verifyIdentity(): Promise<void> {
    const result = await call({ action: 'whoami' });
    const client = result.client ?? {};
    if (String(client.site_id || '') !== siteId) {
      throw new Error(`AllWeb reviewer tenant mismatch: expected ${siteId}`);
    }
    const actual = Array.isArray(client.permissions) ? client.permissions.map(String).sort() : [];
    const expected = [...REVIEWER_PERMISSIONS].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`AllWeb reviewer scope mismatch: expected ${expected.join(', ')}`);
    }
  }

  return {
    async releaseReviewedPost({ slug, expectedRevision, publishedAt }: ReleaseReviewedAllWebPostArgs): Promise<ReleaseReviewedAllWebPostResult> {
      const cleanSlug = requiredSlug(slug);
      if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
        throw new Error('AllWeb reviewer: expectedRevision must be a positive integer');
      }
      await verifyIdentity();
      const current = (await call({ action: 'blog_get', slug: cleanSlug })).post ?? {};
      if (String(current.site_id || '') !== siteId) throw new Error('AllWeb reviewer tenant violation in blog_get');
      const revision = Number(current.revision);
      const status = String(current.status || '');

      if (status === 'published' && revision === expectedRevision + 1) {
        return { slug: cleanSlug, revision, status: 'published', changed: false };
      }
      if (status !== 'review') {
        throw new Error(`AllWeb reviewer: ${cleanSlug} must be in review state (found ${status || 'unknown'})`);
      }
      if (revision !== expectedRevision) {
        throw new Error(`AllWeb reviewer: ${cleanSlug} revision changed (expected ${expectedRevision}, found ${revision})`);
      }

      const candidate = reviewedPost(current, siteId, revision);
      const structuralErrors = [
        ...(!candidate.heroImage ? ['hero image is required'] : []),
        ...(!candidate.heroImageAlt ? ['hero image alt text is required'] : []),
      ];
      if (structuralErrors.length) throw validationError(cleanSlug, structuralErrors);

      if (options.validatePost) {
        const existingPublishedSlugs = await listPublishedSlugs();
        const errors = (await options.validatePost({ post: candidate, existingPublishedSlugs }))
          .map(String).map((value) => value.trim()).filter(Boolean);
        if (errors.length) throw validationError(cleanSlug, errors);
      }

      const released = (await call({
        action: 'blog_publish',
        slug: cleanSlug,
        expected_revision: expectedRevision,
        ...(publishedAt ? { published_at: publishedAt } : {}),
      })).post ?? {};
      if (String(released.site_id || '') !== siteId || String(released.slug || '') !== cleanSlug) {
        throw new Error('AllWeb reviewer tenant or slug violation in blog_publish');
      }
      if (String(released.status || '') !== 'published') {
        throw new Error(`AllWeb reviewer: gateway did not publish ${cleanSlug}`);
      }
      const releasedRevision = Number(released.revision);
      if (!Number.isInteger(releasedRevision) || releasedRevision <= expectedRevision) {
        throw new Error(`AllWeb reviewer: invalid released revision for ${cleanSlug}`);
      }
      return { slug: cleanSlug, revision: releasedRevision, status: 'published', changed: true };
    },
  };

  async function listPublishedSlugs(): Promise<string[]> {
    const slugs: string[] = [];
    let offset = 0;
    const limit = 250;
    while (true) {
      const result = await call({ action: 'blog_list', status: 'published', limit, offset, include_content: false });
      const rows = Array.isArray(result.posts) ? result.posts : [];
      for (const row of rows) {
        if (String(row.site_id || '') !== siteId) throw new Error('AllWeb reviewer tenant violation in blog_list');
        const slug = requiredSlug(String(row.slug || ''));
        if (!slugs.includes(slug)) slugs.push(slug);
      }
      const pagination = result.pagination && typeof result.pagination === 'object' ? result.pagination : null;
      const hasMore = pagination ? pagination.has_more === true : rows.length === limit;
      if (!hasMore || rows.length === 0) break;
      const next = Number(pagination?.next_offset ?? offset + rows.length);
      if (!Number.isInteger(next) || next <= offset) throw new Error('AllWeb reviewer: invalid blog_list pagination');
      offset = next;
    }
    return slugs;
  }
}

function reviewedPost(row: Record<string, any>, siteId: string, revision: number): ReviewedAllWebPost {
  return {
    siteId,
    status: 'review',
    revision,
    slug: String(row.slug || ''),
    title: String(row.title || ''),
    description: String(row.description || ''),
    category: String(row.category || ''),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    author: String(row.author || ''),
    answer: String(row.answer || ''),
    body: String(row.content || ''),
    readMins: Number(row.read_mins || 0),
    faqs: Array.isArray(row.faqs)
      ? row.faqs.map((faq: any) => ({ q: String(faq?.question ?? faq?.q ?? ''), a: String(faq?.answer ?? faq?.a ?? '') }))
      : [],
    ...(Array.isArray(row.sources) ? { sources: row.sources } : {}),
    heroImage: String(row.hero_image || ''),
    heroImageAlt: String(row.hero_image_alt || ''),
    ...(row.hero_image_width == null ? {} : { heroImageWidth: Number(row.hero_image_width) }),
    ...(row.hero_image_height == null ? {} : { heroImageHeight: Number(row.hero_image_height) }),
    ...(row.hero_image_srcset ? { heroImageSrcset: String(row.hero_image_srcset) } : {}),
    ...(row.og_image ? { ogImage: String(row.og_image) } : {}),
  };
}

function validationError(slug: string, errors: string[]): Error {
  return new Error(`AllWeb reviewer: validation failed for ${slug}: ${errors.join('; ')}`);
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`AllWeb reviewer: missing ${name}`);
  return value.trim();
}

function requiredSlug(value: string): string {
  const slug = required(value, 'slug');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('AllWeb reviewer: invalid slug');
  return slug;
}

function boundedInteger(value: number | undefined, min: number, max: number, fallback: number, name: string): number {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`AllWeb reviewer: invalid ${name}`);
  return value;
}
