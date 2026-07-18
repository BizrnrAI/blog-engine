import { yamlString } from './utils.js';
export function toMarkdown(post, args) {
    return [
        '---',
        `title: ${yamlString(post.title)}`,
        `description: ${yamlString(post.description)}`,
        `category: ${yamlString(post.category)}`,
        `date: ${args.dateISO}`,
        `updated: ${args.dateISO}`,
        `readMins: ${Math.max(3, Math.min(15, Number(post.readMins) || 7))}`,
        `answer: ${yamlString(post.answer)}`,
        ...(post.tags.length ? ['tags:', ...post.tags.map((t) => `  - ${yamlString(t)}`)] : []),
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
//# sourceMappingURL=markdown.js.map