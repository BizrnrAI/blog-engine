export interface BlogWorkflowOptions {
    defaultSiteId?: string;
    nodeVersion?: number;
    generateCommand?: string;
    indexCommand?: string;
}
export declare function blogGenerateWorkflow(options?: BlogWorkflowOptions): string;
export declare function blogIndexingWorkflow(options?: BlogWorkflowOptions): string;
//# sourceMappingURL=workflows.d.ts.map