import type { AllWebReviewer, AllWebReviewerOptions } from './types.js';
/**
 * Release client for review-required sites.
 *
 * Generation credentials deliberately cannot call this path. The reviewer token is checked
 * against both the manifest tenant and the exact three-permission role before the candidate is
 * read. Publication uses the revision the reviewer inspected, so a concurrent edit fails rather
 * than releasing different words. Re-running after an indexing outage is safe: a published row
 * at expectedRevision + 1 is treated as the completed first half of the same operation.
 */
export declare function createAllWebReviewer(options: AllWebReviewerOptions): AllWebReviewer;
//# sourceMappingURL=allweb-reviewer.d.ts.map