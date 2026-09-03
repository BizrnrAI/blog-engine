import { AsyncLocalStorage } from 'node:async_hooks';
import { assertBlogEngineRuntime } from './validate-runtime.js';
const scopedRuntime = new AsyncLocalStorage();
export function withBlogEngineRuntime(runtime, fn) {
    assertBlogEngineRuntime(runtime);
    return scopedRuntime.run(runtime, fn);
}
let runtime = null;
/**
 * Install the adapter. The runtime is validated here so a malformed adapter fails immediately with
 * a list of what to fix, rather than deep inside the image pipeline or after a paid model call.
 * Pass `{ validate: false }` only to inspect a deliberately partial config (tests, tooling).
 */
export function configureBlogEngine(nextRuntime, options = {}) {
    if (options.validate !== false)
        assertBlogEngineRuntime(nextRuntime);
    runtime = nextRuntime;
}
export function getBlogRuntime() {
    const active = scopedRuntime.getStore() || runtime;
    if (!active) {
        throw new Error('Blog engine runtime has not been configured. Call configureBlogEngine({ config, topics, brandPersona }) before using the engine.');
    }
    return active;
}
export function getBlogConfig() {
    return getBlogRuntime().config;
}
export function getBlogTopics() {
    return getBlogRuntime().topics;
}
/** Normalized post URL prefix, no trailing slash (default '/blog'). */
export function blogBasePath() {
    const raw = getBlogConfig().paths.blogBasePath || '/blog';
    const cleaned = '/' + raw.replace(/^\/+|\/+$/g, '');
    return cleaned === '/' ? '' : cleaned;
}
/**
 * Pure canonical URL formatter used by every public blog surface.
 *
 * Keeping this independent of the installed runtime lets schema/discovery
 * builders honor explicit standalone options while sharing the exact same
 * slash policy as configured sites.
 */
export function formatBlogPath(basePath, slug, trailingSlash = false) {
    const cleanedBase = '/' + String(basePath || '').replace(/^\/+|\/+$/g, '');
    const base = cleanedBase === '/' ? '' : cleanedBase;
    const cleanSlug = slug == null ? '' : String(slug).replace(/^\/+|\/+$/g, '');
    const path = cleanSlug ? `${base}/${cleanSlug}` : (base || '/');
    if (!trailingSlash || path === '/')
        return path;
    return `${path}/`;
}
/** Pure absolute counterpart to formatBlogPath(). */
export function formatBlogUrl(siteUrl, basePath, slug, trailingSlash = false) {
    return new URL(formatBlogPath(basePath, slug, trailingSlash), siteUrl).href;
}
/** Canonical relative URL for the blog hub. */
export function blogHubPath() {
    return formatBlogPath(blogBasePath(), undefined, Boolean(getBlogConfig().paths.trailingSlash));
}
/** Canonical absolute URL for the blog hub. */
export function blogHubUrl() {
    return formatBlogUrl(getBlogConfig().identity.siteUrl, blogBasePath(), undefined, Boolean(getBlogConfig().paths.trailingSlash));
}
/** Canonical relative URL for one post, honoring the adopting site's policy. */
export function blogPostPath(slug) {
    return formatBlogPath(blogBasePath(), slug, Boolean(getBlogConfig().paths.trailingSlash));
}
/** Canonical absolute URL for one post. */
export function blogPostUrl(slug) {
    return formatBlogUrl(getBlogConfig().identity.siteUrl, blogBasePath(), slug, Boolean(getBlogConfig().paths.trailingSlash));
}
/** True when this site persists posts somewhere other than the filesystem. */
export function hasRemoteStore() {
    try {
        return Boolean(getBlogRuntime().hooks?.store);
    }
    catch {
        return false;
    }
}
export function getBlogHooks() {
    return getBlogRuntime().hooks || {};
}
export function brandPersona() {
    return getBlogRuntime().brandPersona();
}
export const BLOG_CONFIG = new Proxy({}, {
    get(_target, prop) {
        return getBlogConfig()[prop];
    },
});
//# sourceMappingURL=config.js.map