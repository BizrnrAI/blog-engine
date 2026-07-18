import type { ParsedBlogFaq, ParsedBlogPost, ReadGeneratedPostsOptions, SeedBlogPost } from './types.js';
type Frontmatter = Record<string, string>;
export declare function parseBlogFrontmatter(raw: string): {
    frontmatter: Frontmatter;
    content: string;
    faqs: ParsedBlogFaq[];
    tags: string[];
};
export declare function markdownToAnswerSections(content: string, fallbackAnswer: string): {
    heading: string;
    answer: string;
    body: string;
}[];
export declare function readGeneratedBlogPosts(options?: ReadGeneratedPostsOptions): ParsedBlogPost[];
export declare function mergeBlogPosts(seedPosts: readonly SeedBlogPost[], generatedPosts: readonly ParsedBlogPost[]): (ParsedBlogPost | SeedBlogPost)[];
export {};
//# sourceMappingURL=content-reader.d.ts.map