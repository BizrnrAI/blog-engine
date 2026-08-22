export interface BlogWorkflowOptions {
  defaultSiteId?: string;
  nodeVersion?: number;
  generateCommand?: string;
  indexCommand?: string;
  /** Daily sweep cron for the indexing workflow (default '30 16 * * *'); schedule it after your generate cron + merge. */
  indexSweepCron?: string;
}

export function blogGenerateWorkflow(options: BlogWorkflowOptions = {}): string {
  const siteId = options.defaultSiteId || 'generic-service-business';
  const nodeVersion = options.nodeVersion || 22;
  const command = options.generateCommand || 'npm run blog:generate -- --count=${{ inputs.count }} --skip-ping';

  return `name: Blog Generate

on:
  workflow_dispatch:
    inputs:
      count:
        description: Number of posts to generate
        required: false
        default: "1"
      site_id:
        description: Site profile id for this template clone
        required: false
        default: ${siteId}

permissions:
  contents: write
  pull-requests: write

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: ${nodeVersion}
          cache: npm
      - run: npm ci
      - id: blog
        run: ${command}
        env:
          NEXT_PUBLIC_SITE_ID: \${{ inputs.site_id }}
          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
          VERCEL_AI_GATEWAY_BLOG_KEY: \${{ secrets.VERCEL_AI_GATEWAY_BLOG_KEY }}
          GOOGLE_OAUTH_CLIENT_ID: \${{ secrets.GOOGLE_OAUTH_CLIENT_ID }}
          GOOGLE_OAUTH_CLIENT_SECRET: \${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}
          GOOGLE_OAUTH_REFRESH_TOKEN: \${{ secrets.GOOGLE_OAUTH_REFRESH_TOKEN }}
      - run: npm run typecheck
      - run: npm run build
      - uses: peter-evans/create-pull-request@v8
        if: steps.blog.outputs.slugs != ''
        with:
          branch: automation/blog-\${{ github.run_id }}
          title: "Add generated blog post"
          commit-message: "Add generated blog post"
          body: |
            Generated with the canonical Business Runner blog engine.

            Slugs: \`\${{ steps.blog.outputs.slugs }}\`
          labels: blog, automation, seo
`;
}

export function blogIndexingWorkflow(options: BlogWorkflowOptions = {}): string {
  const siteId = options.defaultSiteId || 'generic-service-business';
  const nodeVersion = options.nodeVersion || 22;
  const command = options.indexCommand || 'npm run blog:index -- --slugs=${{ steps.changed.outputs.slugs }} --wait-live';

  const sweepCron = options.indexSweepCron || '30 16 * * *';

  return `name: Blog Indexing

# GitHub never runs a workflow for a push made by the GITHUB_TOKEN, so a PR that
# the generate workflow auto-merges does NOT fire the push trigger below. The
# scheduled sweep catches those posts (anything changed on main in the last 36h);
# workflow_dispatch is the manual backfill.

on:
  workflow_dispatch:
    inputs:
      slugs:
        description: Comma-separated blog slugs to submit
        required: true
      site_id:
        description: Site profile id for this template clone
        required: false
        default: ${siteId}
  schedule:
    - cron: "${sweepCron}"
  push:
    branches:
      - main
    paths:
      - "src/content/blog/**"

permissions:
  contents: read

jobs:
  index:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v7
        with:
          node-version: ${nodeVersion}
          cache: npm
      - run: npm ci
      - id: changed
        shell: bash
        run: |
          if [ -n "\${{ inputs.slugs }}" ]; then
            echo "slugs=\${{ inputs.slugs }}" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          if [ "\${{ github.event_name }}" = "schedule" ]; then
            files="$(git log --since='36 hours ago' --name-only --format= -- src/content/blog)"
          else
            files="$(git diff --name-only HEAD^ HEAD -- src/content/blog)"
          fi
          slugs="$(printf '%s\\n' "$files" | sed -nE 's#^src/content/blog/(.+)\\.md$#\\1#p' | sort -u | paste -sd, -)"
          echo "slugs=$slugs" >> "$GITHUB_OUTPUT"
      - if: steps.changed.outputs.slugs != ''
        run: ${command}
        env:
          NEXT_PUBLIC_SITE_ID: \${{ inputs.site_id || '${siteId}' }}
          INDEXNOW_KEY: \${{ secrets.INDEXNOW_KEY }}
          GOOGLE_OAUTH_CLIENT_ID: \${{ secrets.GOOGLE_OAUTH_CLIENT_ID }}
          GOOGLE_OAUTH_CLIENT_SECRET: \${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}
          GOOGLE_OAUTH_REFRESH_TOKEN: \${{ secrets.GOOGLE_OAUTH_REFRESH_TOKEN }}
`;
}

/**
 * Weekly refresh workflow: rank rescue picks the best existing post (position 8–30) and
 * regenerates it under the content contract on a PR. Same PR-safe shape as generate.
 */
export function blogRefreshWorkflow(options: BlogWorkflowOptions & { refreshCommand?: string; refreshCron?: string } = {}): string {
  const nodeVersion = options.nodeVersion || 22;
  const command = options.refreshCommand || 'npm run blog:refresh -- --max=1';
  const cron = options.refreshCron || '0 14 * * 2';
  return `name: Blog Refresh

on:
  workflow_dispatch:
    inputs:
      slugs:
        description: Comma-separated slugs to refresh (blank = rank rescue picks)
        required: false
  schedule:
    - cron: "${cron}"

permissions:
  contents: write
  pull-requests: write

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: ${nodeVersion}
          cache: npm
      - run: npm ci
      - id: blog
        run: ${command}
        env:
          BLOG_SLUGS: \${{ inputs.slugs }}
          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
          GOOGLE_OAUTH_CLIENT_ID: \${{ secrets.GOOGLE_OAUTH_CLIENT_ID }}
          GOOGLE_OAUTH_CLIENT_SECRET: \${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}
          GOOGLE_OAUTH_REFRESH_TOKEN: \${{ secrets.GOOGLE_OAUTH_REFRESH_TOKEN }}
      - run: npm run typecheck
      - run: npm run build
      - uses: peter-evans/create-pull-request@v8
        if: steps.blog.outputs.slugs != ''
        with:
          branch: automation/blog-refresh-\${{ github.run_id }}
          title: "Refresh blog post(s): \${{ steps.blog.outputs.slugs }}"
          commit-message: "Refresh blog post(s): \${{ steps.blog.outputs.slugs }}"
          body: |
            Rank-rescue refresh by the canonical blog engine (existing URL, honest updated date).

            Slugs: \`\${{ steps.blog.outputs.slugs }}\`
          labels: blog, automation, seo
`;
}
