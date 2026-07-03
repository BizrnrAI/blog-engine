export interface BlogWorkflowOptions {
  defaultSiteId?: string;
  nodeVersion?: number;
  generateCommand?: string;
  indexCommand?: string;
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
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
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
      - uses: peter-evans/create-pull-request@v6
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

  return `name: Blog Indexing

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
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: actions/setup-node@v4
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
          slugs="$(git diff --name-only HEAD^ HEAD -- 'src/content/blog/*.md' | sed -E 's#src/content/blog/(.+)\\.md#\\1#' | paste -sd, -)"
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
