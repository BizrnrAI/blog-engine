import type { CoverImage, GeneratedBlogPost, SeoTopic } from './types';
export declare function applyWatermark(root: string, imageBuffer: Buffer): Promise<Buffer>;
export declare function makeOgCard(root: string, post: GeneratedBlogPost, dryRun?: boolean): Promise<string>;
export declare function generateCoverImage(root: string, post: GeneratedBlogPost, topic: SeoTopic, ordinal: number, dryRun?: boolean): Promise<CoverImage>;
export declare function gradientForOrdinal(ordinal: number): string;
//# sourceMappingURL=images.d.ts.map