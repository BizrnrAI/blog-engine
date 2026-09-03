function schedule(cron) {
    return cron ? `  schedule:\n    - cron: ${JSON.stringify(cron)}\n` : '';
}
function directWorkflow(kind, options) {
    const command = kind === 'generate'
        ? options.generateCommand || 'npm run blog:generate -- --count="$BLOG_COUNT" --skip-ping'
        : options.refreshCommand || 'npm run blog:refresh -- --max=1';
    const index = options.indexCommand || 'npm run blog:index -- --slugs="$BLOG_SLUGS" --wait-live';
    return `name: Blog ${kind === 'generate' ? 'Generate' : 'Refresh'}

on:
  workflow_dispatch:
    inputs:
      count:
        description: Number of posts (website policy applies)
        default: "1"
      slugs:
        description: Optional existing slugs for refresh
        required: false
${schedule(kind === 'generate' ? options.generateCron : options.refreshCron)}
permissions:
  contents: read

concurrency:
  group: blog-publishing-\${{ github.repository }}
  cancel-in-progress: false

jobs:
  publish:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      BLOG_REQUIRE_REMOTE_STORE: "1"
      NEXT_PUBLIC_SITE_ID: ${JSON.stringify(options.defaultSiteId || 'generic-service-business')}
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: ${options.nodeVersion || 22}
          cache: npm
      - run: npm ci
      - name: Generate, validate, and persist directly to the configured store
        id: blog
        run: ${command}
        env:
          BLOG_COUNT: \${{ inputs.count || '1' }}
          BLOG_SLUGS: \${{ inputs.slugs }}
          SUPABASE_URL: \${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          ALLWEB_SITE_AGENT_URL: \${{ vars.ALLWEB_SITE_AGENT_URL }}
          ALLWEB_SITE_TOKEN: \${{ secrets.ALLWEB_SITE_TOKEN }}
          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
          VERCEL_AI_GATEWAY_BLOG_KEY: \${{ secrets.VERCEL_AI_GATEWAY_BLOG_KEY }}
          GOOGLE_OAUTH_CLIENT_ID: \${{ secrets.GOOGLE_OAUTH_CLIENT_ID }}
          GOOGLE_OAUTH_CLIENT_SECRET: \${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}
          GOOGLE_OAUTH_REFRESH_TOKEN: \${{ secrets.GOOGLE_OAUTH_REFRESH_TOKEN }}
      - name: Verify live URLs and submit discovery signals
        if: always() && steps.blog.outputs.slugs != ''
        run: ${index}
        env:
          BLOG_SLUGS: \${{ steps.blog.outputs.slugs }}
          SUPABASE_URL: \${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          ALLWEB_SITE_AGENT_URL: \${{ vars.ALLWEB_SITE_AGENT_URL }}
          ALLWEB_SITE_TOKEN: \${{ secrets.ALLWEB_SITE_TOKEN }}
          INDEXNOW_KEY: \${{ secrets.INDEXNOW_KEY }}
          GOOGLE_OAUTH_CLIENT_ID: \${{ secrets.GOOGLE_OAUTH_CLIENT_ID }}
          GOOGLE_OAUTH_CLIENT_SECRET: \${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}
          GOOGLE_OAUTH_REFRESH_TOKEN: \${{ secrets.GOOGLE_OAUTH_REFRESH_TOKEN }}
`;
}
/** Direct database publication. Never opens a content pull request or changes the checkout. */
export function blogGenerateWorkflow(options = {}) {
    return directWorkflow('generate', options);
}
export function blogRefreshWorkflow(options = {}) {
    return directWorkflow('refresh', options);
}
/** Retry discovery for known stored slugs without regenerating or consulting git history. */
export function blogIndexingWorkflow(options = {}) {
    return `name: Blog Indexing

on:
  workflow_dispatch:
    inputs:
      slugs:
        description: Published database slugs to submit
        required: true

permissions:
  contents: read

jobs:
  index:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: ${options.nodeVersion || 22}
          cache: npm
      - run: npm ci
      - run: ${options.indexCommand || 'npm run blog:index -- --slugs="$BLOG_SLUGS" --wait-live'}
        env:
          BLOG_SLUGS: \${{ inputs.slugs }}
          INDEXNOW_KEY: \${{ secrets.INDEXNOW_KEY }}
          SUPABASE_URL: \${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          ALLWEB_SITE_AGENT_URL: \${{ vars.ALLWEB_SITE_AGENT_URL }}
          ALLWEB_SITE_TOKEN: \${{ secrets.ALLWEB_SITE_TOKEN }}
          GOOGLE_OAUTH_CLIENT_ID: \${{ secrets.GOOGLE_OAUTH_CLIENT_ID }}
          GOOGLE_OAUTH_CLIENT_SECRET: \${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}
          GOOGLE_OAUTH_REFRESH_TOKEN: \${{ secrets.GOOGLE_OAUTH_REFRESH_TOKEN }}
`;
}
/** Daily scorecard workflow: cadence, corpus, feed, sibling workflow health, Search Console, citations → webhook. */
export function blogScorecardWorkflow(options = {}) {
    const nodeVersion = options.nodeVersion || 22;
    const watch = (options.workflowsToWatch || ['blog-generate.yml', 'blog-indexing.yml', 'blog-refresh.yml']).join(',');
    const command = options.scorecardCommand || `npm run blog:scorecard -- --workflows=${watch} --strict`;
    const cron = options.scorecardCron || '0 13 * * *';
    return `name: Blog Scorecard

on:
  workflow_dispatch:
  schedule:
    - cron: "${cron}"

permissions:
  contents: read
  actions: read

jobs:
  scorecard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: ${nodeVersion}
          cache: npm
      - run: npm ci
      - run: ${command}
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: \${{ github.repository }}
          SCORECARD_WEBHOOK_URL: \${{ secrets.SCORECARD_WEBHOOK_URL }}
          GOOGLE_OAUTH_CLIENT_ID: \${{ secrets.GOOGLE_OAUTH_CLIENT_ID }}
          GOOGLE_OAUTH_CLIENT_SECRET: \${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}
          GOOGLE_OAUTH_REFRESH_TOKEN: \${{ secrets.GOOGLE_OAUTH_REFRESH_TOKEN }}
`;
}
//# sourceMappingURL=workflows.js.map