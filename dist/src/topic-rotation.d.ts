import type { ExistingPost, GscQuery, SeoTopic } from './types.js';
/** True when every configured editorial topic already has a published post. */
export declare function allEditorialTopicsCovered(existing: ExistingPost[]): boolean;
export declare function pickTopic(existing: ExistingPost[], gscQueries: GscQuery[], offset: number): SeoTopic;
interface TopicResolutionOptions {
    allowCoveredFallback: boolean;
}
/** Resolve a curated, derived, demand-led, or editorial topic in the adopter's configured rotation. */
export declare function resolveTopic(existing: ExistingPost[], gscQueries: GscQuery[], offset: number): Promise<SeoTopic>;
export declare function resolveTopic(existing: ExistingPost[], gscQueries: GscQuery[], offset: number, options: TopicResolutionOptions): Promise<SeoTopic | null>;
export declare function describeTopic(topic: SeoTopic): string;
export {};
//# sourceMappingURL=topic-rotation.d.ts.map