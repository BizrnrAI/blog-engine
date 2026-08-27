import type { ServiceRunResult, ServiceSite } from './types.js';
/**
 * The blog service: one process that publishes for many sites.
 *
 * This is the low-friction path. Nothing here touches git, CI, tokens, or a site rebuild — a
 * post is written to the site's store and the site renders it on the next request. Adding a
 * site means adding an entry to the sites array (or a row in your registry that produces one),
 * not a repository, a workflow, or a secret.
 *
 * Run it from anywhere a cron can run: a Vercel cron route, a worker, a GitHub schedule if you
 * still want one. Each site is isolated — one site's failure never stops the rest.
 */
export declare function isServiceSiteDue(site: ServiceSite, now: Date): boolean;
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