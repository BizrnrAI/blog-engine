import type { CoverImage, GeneratedBlogPost } from './types.js';
import { yamlString } from './utils.js';

export function toMarkdown(
  post: GeneratedBlogPost,
  args: { gradient: string; cover: CoverImage; dateISO: string },
): string {
  return [
    '---',
    `title: ${yamlString(post.title)}`,
    `description: ${yamlString(post.description)}`,
    `category: ${yamlString(post.category)}`,
    `date: ${args.dateISO}`,
    `readMins: ${Math.max(3, Math.min(15, Number(post.readMins) || 7))}`,
    `answer: ${yamlString(post.answer)}`,
    `gradient: ${yamlString(args.gradient)}`,
    `image: ${yamlString(args.cover.image)}`,
    `imageAlt: ${yamlString(args.cover.imageAlt)}`,
    `ogImage: ${yamlString(args.cover.ogImage)}`,
    'feature: false',
    'faqs:',
    ...post.faqs.slice(0, 4).flatMap((f) => [
      `  - q: ${yamlString(f.q)}`,
      `    a: ${yamlString(f.a)}`,
    ]),
    'draft: false',
    '---',
    '',
    post.body.trim(),
    '',
  ].join('\n');
}
