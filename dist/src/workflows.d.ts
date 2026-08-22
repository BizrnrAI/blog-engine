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
//# sourceMappingURL=workflows.d.ts.map