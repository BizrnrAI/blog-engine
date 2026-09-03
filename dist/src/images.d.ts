import type { BlogEngineConfig, CoverImage, GeneratedBlogPost, SeoTopic } from './types.js';
export declare function applyWatermark(root: string, imageBuffer: Buffer): Promise<Buffer>;
/**
 * Branded, descriptive alt text: a literal scene description (model-written
 * when available) behind a stable brand prefix. Never an identical literal
 * across posts — that reads as keyword stuffing to search engines.
 */
export declare function heroAltText(post: GeneratedBlogPost): string;
/**
 * Responsive variants (image.variants, e.g. [1024, 640]) written as <slug>-<w>.<format>; returns
 * an HTML srcset string including the full-size hero, or '' when no variants are configured.
 */
export declare function writeHeroVariants(root: string, slug: string, format: BlogEngineConfig['image']['format'], fullBuf: Buffer, fullWidth: number | undefined, publicPath: string, fullImageUrl?: string): Promise<string>;
export declare function makeOgCard(root: string, post: GeneratedBlogPost, dryRun?: boolean): Promise<string>;
export declare function generateCoverImage(root: string, post: GeneratedBlogPost, topic: SeoTopic, ordinal: number, dryRun?: boolean): Promise<CoverImage>;
export declare function gradientForOrdinal(ordinal: number): string;
//# sourceMappingURL=images.d.ts.map