import type { BlogContentRules, ExistingPost, GeneratedBlogPost, SeoTopic } from './types.js';
declare const DEFAULT_RULES: Required<Omit<BlogContentRules, 'blockedPhrases'>> & {
    blockedPhrases: readonly string[];
};
export declare function contentRules(): typeof DEFAULT_RULES;
export declare function parseModelJson(text: string): Record<string, unknown>;
export declare function validateGeneratedPost(post: Partial<GeneratedBlogPost>, args: {
    existingSlugs: string[];
    topic: SeoTopic;
}): string[];
export declare function normalizeGeneratedPost(raw: Record<string, unknown>): GeneratedBlogPost;
export declare function generateBlogPost(topic: SeoTopic, existing: ExistingPost[]): Promise<GeneratedBlogPost>;
export {};
//# sourceMappingURL=generate-post.d.ts.map