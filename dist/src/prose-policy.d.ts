import type { BlogEngineHooks, GeneratedBlogPost } from './types.js';
export interface ProsePolicyOptions {
    forbidMoneyAmounts?: boolean;
    forbidObligationDurations?: boolean;
    forbidOfficeClaims?: boolean;
}
/** Domain-neutral mechanical checks for regulated-site prose. */
export declare function validateProsePolicy(post: GeneratedBlogPost, options: ProsePolicyOptions): string[];
export declare function createProsePolicyValidator(options: ProsePolicyOptions): NonNullable<BlogEngineHooks['validatePost']>;
//# sourceMappingURL=prose-policy.d.ts.map