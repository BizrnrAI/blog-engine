import type { GscPageQuery, RankRescueAction, RankRescueCandidate } from './types.js';
/**
 * Rank rescue — the ASEO skill's scoring for "which existing page deserves work next":
 *
 *   score = impressions × intentWeight × positionMultiplier × zeroClickMultiplier
 *   position: 8–30 → 2; 31–60 → 1; >60 → 0.5; <8 with CTR<1% → 1.5; otherwise 1
 *   zero clicks → 1.5
 *
 * Eligibility: ≥ 25 impressions over the window. Intent weight defaults to 1 (blog posts are
 * discover/support intent); pass intentWeightFor to score owner-like posts higher.
 */
export interface RankRescueOptions {
    minImpressions?: number;
    /** e.g. (slug) => 2 for evaluate-intent posts, 3 for convert. Default 1. */
    intentWeightFor?: (slug: string) => number;
    /** Path prefix that precedes the slug in page URLs (default '/blog/'). */
    pathPrefix?: string;
    topQueries?: number;
}
export declare function positionMultiplier(position: number, ctr: number): number;
export declare function classifyAction(position: number, ctr: number): RankRescueAction;
export declare function slugFromPage(page: string, pathPrefix?: string): string | null;
export declare function rankRescueCandidates(rows: readonly GscPageQuery[], options?: RankRescueOptions): RankRescueCandidate[];
//# sourceMappingURL=rank-rescue.d.ts.map