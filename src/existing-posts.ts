import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOG_CONFIG } from './config';
import type { ExistingPost } from './types';

export function readExistingPosts(root: string): ExistingPost[] {
  const blogDir = join(root, BLOG_CONFIG.paths.blogDir);
  if (!existsSync(blogDir)) return [];
  return readdirSync(blogDir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => {
      const raw = readFileSync(join(blogDir, f), 'utf8');
      const title = (raw.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || '';
      return { slug: f.replace(/\.md$/, ''), title };
    });
}
