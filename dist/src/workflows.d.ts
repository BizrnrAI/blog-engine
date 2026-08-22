export interface BlogWorkflowOptions {
    defaultSiteId?: string;
    nodeVersion?: number;
    generateCommand?: string;
    indexCommand?: string;
    /** Daily sweep cron for the indexing workflow (default '30 16 * * *'); schedule it after your generate cron + merge. */
    indexSweepCron?: string;
}
export declare function blogGenerateWorkflow(options?: BlogWorkflowOptions): string;
export declare function blogIndexingWorkflow(options?: BlogWorkflowOptions): string;
/**
 * Weekly refresh workflow: rank rescue picks the best existing post (position 8–30) and
 * regenerates it under the content contract on a PR. Same PR-safe shape as generate.
 */
export declare function blogRefreshWorkflow(options?: BlogWorkflowOptions & {
    refreshCommand?: string;
    refreshCron?: string;
}): string;
/** Daily scorecard workflow: cadence, corpus, feed, sibling workflow health, Search Console, citations → webhook. */
export declare function blogScorecardWorkflow(options?: BlogWorkflowOptions & {
    scorecardCommand?: string;
    scorecardCron?: string;
    workflowsToWatch?: string[];
}): string;
//# sourceMappingURL=workflows.d.ts.map