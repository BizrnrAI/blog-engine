import { formatServiceReport, runBlogService } from '../../src/index.js';
import { sites } from './sites.js';
/**
 * The entire service. Point a scheduler at this file — a Vercel cron route, a worker, a
 * container, anything that can run Node on a timer.
 *
 *   npx tsx examples/service/run.ts             # publish for every due site
 *   npx tsx examples/service/run.ts --dry-run   # show what would happen
 *   npx tsx examples/service/run.ts --only=acme-plumbing
 *
 * Exits non-zero if any site failed, so a scheduler surfaces the failure.
 */
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const results = await runBlogService(sites, {
    dryRun: process.argv.includes('--dry-run'),
    refresh: true, // also improve one existing post per site, per run
    ...(only ? { only: [only] } : {}),
});
console.log(formatServiceReport(results));
if (results.some((r) => r.status === 'failed'))
    process.exitCode = 1;
//# sourceMappingURL=run.js.map