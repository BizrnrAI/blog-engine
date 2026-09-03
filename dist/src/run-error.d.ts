/** A failed batch may already have persisted posts. Preserve them for indexing-only retries. */
export declare class BlogRunError extends Error {
    readonly operation: 'generate' | 'refresh';
    readonly written: string[];
    constructor(operation: 'generate' | 'refresh', written: string[], cause: unknown);
}
//# sourceMappingURL=run-error.d.ts.map