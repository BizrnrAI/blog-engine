#!/usr/bin/env tsx
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureSdbgBlogEngine } from './runtime';
import { generateBlogRun } from '../../src';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const countArg = args.find((a) => a.startsWith('--count='));
const count = Math.max(1, Number(countArg?.split('=')[1] || '1') || 1);
const skipPing = args.includes('--skip-ping') || process.env.SKIP_PING === '1';

configureSdbgBlogEngine();
const result = await generateBlogRun(root, { count, dryRun, skipPing });

if (process.env.GITHUB_OUTPUT && result.written.length) {
  writeFileSync(process.env.GITHUB_OUTPUT, `slugs=${result.written.join(',')}\n`, { flag: 'a' });
}

if (!dryRun && result.written.length === 0 && !result.skipped) {
  process.exitCode = 1;
}
