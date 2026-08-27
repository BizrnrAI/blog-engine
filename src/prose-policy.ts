import type { BlogEngineHooks, GeneratedBlogPost } from './types.js';

export interface ProsePolicyOptions {
  forbidMoneyAmounts?: boolean;
  forbidObligationDurations?: boolean;
  forbidOfficeClaims?: boolean;
}

const WORDS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty|forty|fifty|sixty|ninety|hundred';
const DURATION = new RegExp(String.raw`(?:\b\d+\s*(?:(?:-|–|—|to)\s*\d+)?|\b(?:${WORDS})(?:[-\s](?:${WORDS}))*(?:\s+to\s+(?:${WORDS})(?:[-\s](?:${WORDS}))*)?)\s+(?:calendar\s+|business\s+)?(?:day|days|week|weeks|month|months|year|years)\b`, 'gi');
const OBLIGATION = /\b(?:within|no later than|deadline|must|required|statutor(?:y|ily)|expires?|limitations?|barred|clock|you have|has\s+[^.!?\n]{0,30}\b(?:to|before))\b/i;
const MONEY = [
  /\$\s?[\d,]+(?:\.\d{1,2})?/gi,
  /\b(?:a few|several|many|hundreds?|thousands?|millions?)\s+(?:of\s+)?(?:hundred|thousand|million|dollars?)\b/gi,
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:hundred|thousand|million)\s+dollars?\b/gi,
];
const OFFICE = [
  /\b\d{2,6}\s+[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3}\s+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Suite|Ste\.?)\b/g,
  /\bour\s+(?:office|offices)\s+in\b/gi,
];

function prose(post: GeneratedBlogPost): string {
  return [post.title, post.description, post.answer, post.body, ...post.faqs.flatMap((faq) => [faq.q, faq.a])].filter(Boolean).join('\n\n');
}

function matches(text: string, patterns: readonly RegExp[]): string[] {
  return patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[0].trim()));
}

/** Domain-neutral mechanical checks for regulated-site prose. */
export function validateProsePolicy(post: GeneratedBlogPost, options: ProsePolicyOptions): string[] {
  const text = prose(post);
  const errors: string[] = [];
  if (options.forbidMoneyAmounts) {
    for (const match of matches(text, MONEY)) errors.push(`money amount must live on its canonical owner page, not blog prose ("${match}")`);
  }
  if (options.forbidObligationDurations) {
    for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
      if (!OBLIGATION.test(sentence)) continue;
      for (const match of sentence.matchAll(DURATION)) errors.push(`numeric legal deadline must live on its canonical owner page, not blog prose ("${match[0].trim()}")`);
    }
  }
  if (options.forbidOfficeClaims) {
    for (const match of matches(text, OFFICE)) errors.push(`unverified office-location claim is not allowed ("${match}")`);
  }
  return [...new Set(errors)];
}

export function createProsePolicyValidator(options: ProsePolicyOptions): NonNullable<BlogEngineHooks['validatePost']> {
  return ({ post }) => validateProsePolicy(post, options);
}
