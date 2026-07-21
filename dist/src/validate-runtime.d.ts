/**
 * ADOPTION GUARDRAIL — fail fast, in the adapter, with an actionable message.
 *
 * Every rule here exists because getting it wrong otherwise fails LATE and OBSCURELY: an empty
 * `heroPhotos` surfaces as `Cannot read properties of undefined (reading 'url')` from inside the
 * image pipeline, an empty `allowedCategories` makes every generated post fail category validation
 * three times and then throw, and a missing `internalLinks` entry means no post can ever satisfy
 * the internal-link rule. A new adopter should be told which config field is wrong before the
 * engine spends a model call finding out.
 *
 * Runs automatically from `configureBlogEngine`. It validates the SHAPE of the adapter, never the
 * environment — missing API keys and absent Search Console credentials are legitimate states that
 * the engine degrades through on purpose.
 */
import type { BlogEngineRuntime } from './types.js';
export declare class BlogEngineConfigError extends Error {
    readonly problems: string[];
    constructor(problems: string[]);
}
/**
 * Returns the list of problems (empty when the runtime is usable). Exported so an adapter can
 * lint itself in CI without configuring the engine.
 */
export declare function validateBlogEngineRuntime(runtime: BlogEngineRuntime): string[];
/** Throws a single, readable error listing everything wrong with the adapter. */
export declare function assertBlogEngineRuntime(runtime: BlogEngineRuntime): void;
//# sourceMappingURL=validate-runtime.d.ts.map