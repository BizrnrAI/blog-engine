/**
 * OPTIONAL ADAPTER — not part of the engine core.
 *
 * A convenience that derives a whole runtime from a `TemplateSiteProfile`, for fleets of
 * similarly-shaped template sites. Nothing in the engine imports this file: `generateBlogRun` and
 * everything it depends on work entirely from `BlogEngineConfig`, so a site that hand-writes its
 * own adapter (the normal case) can ignore this module completely. It exists to save boilerplate
 * for one particular deployment pattern, and must never become a dependency of the core.
 */
import type { BlogEngineRuntime, TemplateRuntimeOptions, TemplateSiteProfile } from './types.js';
export declare function buildTemplateBlogEngineRuntime(site: TemplateSiteProfile, options?: TemplateRuntimeOptions): BlogEngineRuntime;
//# sourceMappingURL=template-runtime.d.ts.map