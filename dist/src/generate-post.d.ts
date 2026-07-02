import type { ExistingPost, GeneratedBlogPost, SeoTopic } from './types';
export declare function validateGeneratedPost(post: Partial<GeneratedBlogPost>, args: {
    existingSlugs: string[];
    topic: SeoTopic;
}): string[];
export declare function generateBlogPost(topic: SeoTopic, existing: ExistingPost[]): Promise<GeneratedBlogPost>;
//# sourceMappingURL=generate-post.d.ts.map