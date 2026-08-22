import type { ParsedBlogFaq, ParsedBlogPost, ReadGeneratedPostsOptions, SeedBlogPost } from './types.js';
type Frontmatter = Record<string, string>;
export interface ParseFrontmatterOptions {
    /** Alias table to apply (default: engine defaults merged with paths.frontmatterAliases). */
    aliases?: Readonly<Record<string, string>>;
    /** Set false to get the file literal keys with no alias normalization. */
    normalize?: boolean;
}
/**
 * Parse frontmatter and normalize site-specific key aliases onto the engine canonical keys
 * (see src/frontmatter.ts). Original keys are always preserved.
 */
export declare function parseBlogFrontmatter(raw: string, options?: ParseFrontmatterOptions): {
    frontmatter: Frontmatter;
    content: string;
    faqs: ParsedBlogFaq[];
    tags: string[];
    sources: Array<{
        title: string;
        url: string;
        publisher?: string;
    }>;
};
/**
 * Parse one post honouring hooks.parseFrontmatter when a site owns the format. Hook output is
 * alias-normalized too, so a hook can return its native keys.
 */
export declare function parsePostFile(raw: string, slug: string): {
    frontmatter: Frontmatter;
    content: string;
    faqs: ParsedBlogFaq[];
    tags: string[];
    sources: Array<{
        title: string;
        url: string;
        publisher?: string;
    }>;
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