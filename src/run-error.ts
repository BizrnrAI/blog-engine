/** A failed batch may already have persisted posts. Preserve them for indexing-only retries. */
export class BlogRunError extends Error {
  constructor(readonly operation: 'generate' | 'refresh', readonly written: string[], cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'BlogRunError';
  }
}
