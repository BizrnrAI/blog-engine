export interface BlogWorkflowOptions {
    defaultSiteId?: string;
    nodeVersion?: number;
    generateCommand?: string;
    indexCommand?: string;
    /** Website-owned schedule. Omit to use dispatch or the site's external scheduler. */
    generateCron?: string;
    /** @deprecated Database indexing uses explicit slugs, never git history. */
    indexSweepCron?: string;
}
/** Direct database publication. Never opens a content pull request or changes the checkout. */
export declare function blogGenerateWorkflow(options?: BlogWorkflowOptions): string;
export declare function blogRefreshWorkflow(options?: BlogWorkflowOptions & {
    refreshCommand?: string;
    refreshCron?: string;
}): string;
/** Retry discovery for known stored slugs without regenerating or consulting git history. */
export declare function blogIndexingWorkflow(options?: BlogWorkflowOptions): string;
/** Daily scorecard workflow: cadence, corpus, feed, sibling workflow health, Search Console, citations → webhook. */
export declare function blogScorecardWorkflow(options?: BlogWorkflowOptions & {
    scorecardCommand?: string;
    scorecardCron?: string;
    workflowsToWatch?: string[];
}): string;
//# sourceMappingURL=workflows.d.ts.map