import { BLOG_CONFIG, blogBasePath, getBlogHooks } from './config.js';
import { auditBlogCorpus } from './audit.js';
import { readExistingPosts } from './existing-posts.js';
import { getGscPageQueries } from './gsc.js';
import type { CitationProbe, Scorecard, ScorecardCheck } from './types.js';

/**
 * Daily scorecard — the one aggregation layer that turns "is the blog alive and improving?"
 * into a pass/warn/fail list a human or a Slack channel can read in ten seconds. Ops first
 * (red crons, stale cadence, broken feed), then corpus health, then demand (Search Console),
 * then grounded citations. Missing sources are N/A, never zero; a red cron is a FAIL so the
 * class of silent outage found in the Aug-2026 audit surfaces within a day.
 */
export interface ScorecardOptions {
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

async function checkWorkflows(repo: string, workflows: string[]): Promise<ScorecardCheck[]> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) return workflows.map((w) => ({ name: `workflow:${w}`, status: 'na', detail: 'no GITHUB_TOKEN' }));
  const out: ScorecardCheck[] = [];
  for (const w of workflows) {
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(w)}/runs?per_page=5&status=completed`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'bizrnr-blog-engine' },
      });
      if (!r.ok) {
        out.push({ name: `workflow:${w}`, status: 'na', detail: `GitHub API ${r.status}` });
        continue;
      }
      const j = (await r.json()) as { workflow_runs?: Array<{ conclusion: string; created_at: string; html_url: string }> };
      const runs = j.workflow_runs || [];
      if (!runs.length) { out.push({ name: `workflow:${w}`, status: 'warn', detail: 'no completed runs yet' }); continue; }
      const latest = runs[0];
      const streak = runs.findIndex((x) => x.conclusion === 'success');
      const failures = streak === -1 ? runs.length : streak;
      if (latest.conclusion === 'success') out.push({ name: `workflow:${w}`, status: 'pass', detail: `last run ${latest.created_at.slice(0, 10)} success` });
      else if (failures >= 2) out.push({ name: `workflow:${w}`, status: 'fail', detail: `${failures} consecutive failures — ${latest.html_url}` });
      else out.push({ name: `workflow:${w}`, status: 'warn', detail: `latest run ${latest.conclusion} — ${latest.html_url}` });
    } catch (err) {
      out.push({ name: `workflow:${w}`, status: 'na', detail: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

export async function runScorecard(root: string, options: ScorecardOptions = {}): Promise<Scorecard> {
  const now = options.now || new Date();
  const checks: ScorecardCheck[] = [];
  const site = BLOG_CONFIG.identity.siteHost;

  // 1. cadence
  const posts = readExistingPosts(root).filter((p) => p.date);
  const latest = posts.map((p) => Date.parse(p.date!)).filter((t) => !Number.isNaN(t)).sort((a, b) => b - a)[0];
  const cadence = options.expectedCadenceDays ?? 7;
  if (!latest) checks.push({ name: 'cadence', status: 'warn', detail: 'no dated posts found' });
  else {
    const age = (now.getTime() - latest) / 864e5;
    checks.push({
      name: 'cadence',
      status: age > cadence * 3 ? 'fail' : age > cadence * 1.5 ? 'warn' : 'pass',
      detail: `latest post ${Math.round(age)} days ago (expected every ~${cadence})`,
    });
  }

  // 2. corpus audit
  try {
    const audit = auditBlogCorpus(root, { now });
    const block = audit.filter((e) => e.verdict === 'BLOCK').length;
    const fix = audit.filter((e) => e.verdict === 'FIX').length;
    checks.push({ name: 'corpus', status: block ? 'fail' : fix ? 'warn' : 'pass', detail: `${audit.length} posts — SHIP ${audit.length - block - fix} · FIX ${fix} · BLOCK ${block}` });
  } catch (err) {
    checks.push({ name: 'corpus', status: 'na', detail: err instanceof Error ? err.message : String(err) });
  }

  // 3. feed
  try {
    const feedUrl = `${BLOG_CONFIG.identity.siteUrl}${BLOG_CONFIG.rss.path}`;
    const r = await fetch(feedUrl, { redirect: 'follow' });
    const text = r.ok ? await r.text() : '';
    const items = (text.match(/<item>/g) || []).length;
    checks.push({ name: 'feed', status: r.ok && items > 0 ? 'pass' : 'fail', detail: `${feedUrl} → ${r.status}, ${items} items` });
  } catch (err) {
    checks.push({ name: 'feed', status: 'fail', detail: err instanceof Error ? err.message : String(err) });
  }

  // 4. workflows
  if (options.repo && options.workflows?.length) checks.push(...(await checkWorkflows(options.repo, options.workflows)));

  // 5. demand (Search Console, 28d)
  try {
    const rows = await getGscPageQueries(`${blogBasePath()}/`);
    if (!rows.length) checks.push({ name: 'search-console', status: 'na', detail: 'no data or not configured' });
    else {
      const impressions = rows.reduce((s, r) => s + r.impressions, 0);
      const clicks = rows.reduce((s, r) => s + r.clicks, 0);
      checks.push({ name: 'search-console', status: 'pass', detail: `28d: ${impressions} impressions, ${clicks} clicks across ${new Set(rows.map((r) => r.page)).size} posts` });
    }
  } catch (err) {
    checks.push({ name: 'search-console', status: 'na', detail: err instanceof Error ? err.message : String(err) });
  }

  // 6. citations
  const probe = getBlogHooks().probeCitations;
  if (probe && options.citationQueries?.length) {
    try {
      const probes: CitationProbe[] = await probe({ queries: options.citationQueries, siteHost: site });
      const available = probes.filter((p) => p.available);
      const mentioned = available.filter((p) => p.mentioned).length;
      checks.push({
        name: 'citations',
        status: available.length ? 'pass' : 'na',
        detail: available.length ? `${mentioned}/${available.length} available probes mention ${site}` : 'no provider available',
      });
    } catch (err) {
      checks.push({ name: 'citations', status: 'na', detail: err instanceof Error ? err.message : String(err) });
    }
  } else checks.push({ name: 'citations', status: 'na', detail: 'no probeCitations hook' });

  const failing = checks.filter((c) => c.status === 'fail').length;
  const warning = checks.filter((c) => c.status === 'warn').length;
  const summary = `${site} blog scorecard ${now.toISOString().slice(0, 10)}: ${failing ? `${failing} FAIL` : 'no failures'}${warning ? `, ${warning} warn` : ''} — ` +
    checks.map((c) => `${c.name}=${c.status.toUpperCase()}`).join(' ');
  return { generatedAt: now.toISOString(), site, checks, summary, failing, warning };
}

export function formatScorecard(card: Scorecard): string {
  const icon = { pass: '✓', warn: '!', fail: '✗', na: '·' } as const;
  return [card.summary, '', ...card.checks.map((c) => `${icon[c.status]} ${c.name.padEnd(24)} ${c.detail}`)].join('\n');
}

/** POST the scorecard to a Slack-compatible webhook (SCORECARD_WEBHOOK_URL) — only when set. */
export async function postScorecard(card: Scorecard, webhookUrl = process.env.SCORECARD_WEBHOOK_URL): Promise<boolean> {
  if (!webhookUrl) return false;
  const r = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: formatScorecard(card) }) });
  return r.ok;
}
