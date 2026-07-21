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