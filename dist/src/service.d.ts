import type { ServiceRunResult, ServiceSite } from './types.js';
export interface RunServiceOptions {
    /** Generate a post per due site (default true). */
    generate?: boolean;
    /** Also run one rank-rescue/backlog refresh per due site (default false). */
    refresh?: boolean;
    /** Print what would happen without writing or calling a model. */
    dryRun?: boolean;
    /** Only run these site ids. */
    only?: readonly string[];
    now?: Date;
}
/**
 * Publish for every due site. Returns one result per site — always, including failures, so a
 * caller (or the scorecard) can see exactly which sites moved and which did not.
 */
export declare function runBlogService(sites: readonly ServiceSite[], options?: RunServiceOptions): Promise<ServiceRunResult[]>;
export declare function formatServiceReport(results: readonly ServiceRunResult[]): string;
//# sourceMappingURL=service.d.ts.map