/** A failed batch may already have persisted posts. Preserve them for indexing-only retries. */
export class BlogRunError extends Error {
    operation;
    written;
    constructor(operation, written, cause) {
        super(cause instanceof Error ? cause.message : String(cause), { cause });
        this.operation = operation;
        this.written = written;
        this.name = 'BlogRunError';
    }
}
//# sourceMappingURL=run-error.js.map