import type { BlogContentRules, ExistingPost, GeneratedBlogPost, SeoTopic } from './types.js';
declare const DEFAULT_RULES: Required<Omit<BlogContentRules, 'blockedPhrases' | 'extraRules' | 'maxPostsPerWeek'>> & {
    maxPostsPerWeek?: number;
    blockedPhrases: readonly string[];
    extraRules: readonly string[];
};
export declare function contentRules(): typeof DEFAULT_RULES;
/** Existing posts offered as link targets: the most recent 30, as { title, path }. */
export declare function relatedLinkTargets(existing: readonly ExistingPost[], limit?: number): Array<{
    title: string;
    path: string;
}>;
/**
 * Escape raw control characters that appear INSIDE string literals. Models routinely emit a
 * literal newline inside a JSON string (Markdown bodies especially), which is invalid JSON but
 * unambiguous to repair: outside strings the whitespace is untouched.
 */
export declare function repairJsonStringNewlines(text: string): string;
/**
 * Parse the model's JSON out of whatever it wrapped it in.
 *
 * Real failures this handles: a fenced block whose body contains its own ``` fences (the lazy
 * first-fence match then stops early and yields a truncated object), a preamble/epilogue around
 * the object, and raw newlines inside string values. Candidates are tried widest-usable-first and
 * the first one that parses to an object wins.
 */
export declare function parseModelJson(text: string): Record<string, unknown>;
export declare function validateGeneratedPost(post: Partial<GeneratedBlogPost>, args: {
    existingSlugs: string[];
    topic: SeoTopic;
}): string[];
export declare function normalizeGeneratedPost(raw: Record<string, unknown>, topic?: Pick<SeoTopic, 'slug' | 'title'>): GeneratedBlogPost;
export declare function generateBlogPost(topic: SeoTopic, existing: ExistingPost[]): Promise<GeneratedBlogPost>;
export {};
//# sourceMappingURL=generate-post.d.ts.map