import type { ExistingPost, GscQuery, SeoTopic } from './types.js';
/** True when every configured editorial topic already has a published post. */
export declare function allEditorialTopicsCovered(existing: ExistingPost[]): boolean;
export declare function pickTopic(existing: ExistingPost[], gscQueries: GscQuery[], offset: number): SeoTopic;
/**
 * The topic the engine will actually write about: `hooks.pickTopic` first (a curated,
 * priority-ordered catalog or an external calendar), then `hooks.deriveTopic` when the editorial
 * pool is exhausted, then the built-in rotation. With no hooks this is exactly `pickTopic`.
 */
export declare function resolveTopic(existing: ExistingPost[], gscQueries: GscQuery[], offset: number): Promise<SeoTopic>;
export declare function describeTopic(topic: SeoTopic): string;
//# sourceMappingURL=topic-rotation.d.ts.map