import type { Scorecard } from './types.js';
/**
 * Retrieval crawlers — the user agents that fetch a page to ANSWER a question right now, as
 * opposed to training crawlers. Blocking one of these is a silent, total loss of AI citation
 * for that provider, and nothing in a build ever notices.
 */
export declare const RETRIEVAL_CRAWLERS: readonly ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Claude-SearchBot", "Claude-User", "Googlebot"];
/** Is this user agent disallowed from the blog path by robots.txt? */
export declare function crawlerBlocked(robotsTxt: string, userAgent: string, path: string): boolean;
/**
 * Daily scorecard — the one aggregation layer that turns "is the blog alive and improving?"
 * into a pass/warn/fail list a human or a Slack channel can read in ten seconds. Ops first
 * (red crons, stale cadence, broken feed), then corpus health, then demand (Search Console),
 * then grounded citations. Missing sources are N/A, never zero; a red cron is a FAIL so the
 * class of silent outage found in the Aug-2026 audit surfaces within a day.
 */
export interface ScorecardOptions {
    /** Fetch live URLs and assert the citable answer is in the raw HTML (default true). */
    liveProbe?: boolean;
    /** Fail when a blog PR has been open longer than this (default 48h). */
    maxPrAgeHours?: number;
    /** How many posts form the fixed index-coverage cohort (default 25). */
    indexCohortSize?: number;
    /** GitHub "owner/repo" for workflow-run checks; needs GITHUB_TOKEN (actions:read). */
    repo?: string;
    /** Workflow file names to check, e.g. ['autoblog.yml', 'blog-indexing.yml', 'blog-refresh.yml']. */
    workflows?: string[];
    /** Expected days between posts (warn past 1.5×, fail past 3×). */
    expectedCadenceDays?: number;
    /** Queries to probe for citations via hooks.probeCitations. */
    citationQueries?: string[];
    now?: Date;
}
export declare function runScorecard(root: string, options?: ScorecardOptions): Promise<Scorecard>;
export declare function formatScorecard(card: Scorecard): string;
/** POST the scorecard to a Slack-compatible webhook (SCORECARD_WEBHOOK_URL) — only when set. */
export declare function postScorecard(card: Scorecard, webhookUrl?: string | undefined): Promise<boolean>;
//# sourceMappingURL=scorecard.d.ts.map