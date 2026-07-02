let runtime = null;
export function configureBlogEngine(nextRuntime) {
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
export function brandPersona() {
    return getBlogRuntime().brandPersona();
}
export const BLOG_CONFIG = new Proxy({}, {
    get(_target, prop) {
        return getBlogConfig()[prop];
    },
});
//# sourceMappingURL=config.js.map