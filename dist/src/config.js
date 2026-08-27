import { assertBlogEngineRuntime } from './validate-runtime.js';
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
    if (!runtime) {
        throw new Error('Blog engine runtime has not been configured. Call configureBlogEngine({ config, topics, brandPersona }) before using the engine.');
    }
    return runtime;
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
/** Canonical relative URL for one post, honoring the adopting site's policy. */
export function blogPostPath(slug) {
    const path = `${blogBasePath()}/${String(slug).replace(/^\/+|\/+$/g, '')}`;
    return getBlogConfig().paths.trailingSlash ? `${path}/` : path;
}
/** Canonical absolute URL for one post. */
export function blogPostUrl(slug) {
    return new URL(blogPostPath(slug), getBlogConfig().identity.siteUrl).href;
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