import type { CorpusAuditEntry, ParsedBlogPost } from './types.js';
/**
 * Corpus audit — the ASEO skill's blog verdicts applied to every published post:
 *   SHIP  distinct, useful, structurally complete, current
 *   FIX   recoverable gaps (thin answer block, missing dims/author/tags, stale, weak FAQs…)
 *   BLOCK unsafe or unusable (blocked claim phrases, near-empty body, missing title)
 * Pure and offline: reads the Markdown, applies the same contract the generator enforces.
 */
export interface AuditOptions {
    blogDir?: string;
    /** Days after which an un-refreshed post is flagged FIX:stale (default 365). */
    staleAfterDays?: number;
    now?: Date;
}
export declare function auditPost(post: ParsedBlogPost, context: {
    allSlugs: Set<string>;
    altCounts: Map<string, number>;
    now: Date;
    staleAfterDays: number;
    inboundCounts?: Map<string, number>;
}): CorpusAuditEntry;
/** Audit posts from ANY source — a filesystem read, a database query, a test fixture. */
export declare function auditPosts(posts: readonly ParsedBlogPost[], options?: AuditOptions): CorpusAuditEntry[];
/** Slugs the audit says must not appear in public surfaces — feed the discovery/RSS `exclude`. */
export declare function blockedSlugs(entries: readonly CorpusAuditEntry[]): string[];
/** Audit the filesystem corpus at `root` (the default store). */
export declare function auditBlogCorpus(root: string, options?: AuditOptions): CorpusAuditEntry[];
export declare function formatAuditReport(entries: readonly CorpusAuditEntry[]): string;
//# sourceMappingURL=audit.d.ts.map