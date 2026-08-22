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
export declare function parseModelJson(text: string): Record<string, unknown>;
export declare function validateGeneratedPost(post: Partial<GeneratedBlogPost>, args: {
    existingSlugs: string[];
    topic: SeoTopic;
}): string[];
export declare function normalizeGeneratedPost(raw: Record<string, unknown>): GeneratedBlogPost;
export declare function generateBlogPost(topic: SeoTopic, existing: ExistingPost[]): Promise<GeneratedBlogPost>;
export {};
//# sourceMappingURL=generate-post.d.ts.map