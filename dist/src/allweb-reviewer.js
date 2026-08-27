const REVIEWER_PERMISSIONS = ['blog:publish', 'blog:read', 'site:read'];
/**
 * Release client for review-required sites.
 *
 * Generation credentials deliberately cannot call this path. The reviewer token is checked
 * against both the manifest tenant and the exact three-permission role before the candidate is
 * read. Publication uses the revision the reviewer inspected, so a concurrent edit fails rather
 * than releasing different words. Re-running after an indexing outage is safe: a published row
 * at expectedRevision + 1 is treated as the completed first half of the same operation.
 */
export function createAllWebReviewer(options) {
    const apiUrl = required(options.apiUrl, 'apiUrl');
    const token = required(options.token, 'token');
    const siteId = required(options.siteId, 'siteId');
    const timeoutMs = boundedInteger(options.timeoutMs, 100, 60_000, 8_000, 'timeoutMs');
    async function call(body) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || result.ok !== true) {
                const error = new Error(`AllWeb ${String(body.action)} ${response.status}: ${String(result.error || 'request_failed')}`);
                Object.assign(error, { status: response.status, code: result.error });
                throw error;
            }
            return result;
        }
        catch (error) {
            if (error?.name === 'AbortError')
                throw new Error(`AllWeb ${String(body.action)} timed out after ${timeoutMs}ms`);
            throw error;
        }
        finally {
            clearTimeout(timer);
        }
    }
    async function verifyIdentity() {
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
        async releaseReviewedPost({ slug, expectedRevision, publishedAt }) {
            const cleanSlug = requiredSlug(slug);
            if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
                throw new Error('AllWeb reviewer: expectedRevision must be a positive integer');
            }
            await verifyIdentity();
            const current = (await call({ action: 'blog_get', slug: cleanSlug })).post ?? {};
            if (String(current.site_id || '') !== siteId)
                throw new Error('AllWeb reviewer tenant violation in blog_get');
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
}
function required(value, name) {
    if (!value?.trim())
        throw new Error(`AllWeb reviewer: missing ${name}`);
    return value.trim();
}
function requiredSlug(value) {
    const slug = required(value, 'slug');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
        throw new Error('AllWeb reviewer: invalid slug');
    return slug;
}
function boundedInteger(value, min, max, fallback, name) {
    if (value == null)
        return fallback;
    if (!Number.isInteger(value) || value < min || value > max)
        throw new Error(`AllWeb reviewer: invalid ${name}`);
    return value;
}
//# sourceMappingURL=allweb-reviewer.js.map