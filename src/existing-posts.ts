import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOG_CONFIG } from './config.js';
import { contentExtensions, isPostFile, parsePostFile, slugFromFile } from './content-reader.js';
import type { ExistingPost } from './types.js';

export function readExistingPosts(root: string): ExistingPost[] {
  const blogDir = join(root, BLOG_CONFIG.paths.blogDir);
  if (!existsSync(blogDir)) return [];
  const extensions = contentExtensions();
  return readdirSync(blogDir)
    .filter((f) => isPostFile(f, extensions))
    .map((f) => {
      const slug = slugFromFile(f, extensions);
      const raw = readFileSync(join(blogDir, f), 'utf8');
      // Alias-aware: a site writing pubDate: still feeds the cadence guard and refresh.
      const { frontmatter } = parsePostFile(raw, slug);
      const title = frontmatter.title || '';
      const date = /^\d{4}-\d{2}-\d{2}$/.test(frontmatter.date || '') ? frontmatter.date : undefined;
      return { slug, title, ...(date ? { date } : {}) };
    });
}
