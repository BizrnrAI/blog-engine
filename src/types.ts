export type TopicCategory = string;

export interface SeoTopic {
  type: 'gsc' | 'editorial' | 'crosspromo';
  keyword: string;
  category: TopicCategory;
  angle: string;
  mustBacklink: boolean;
  impressions?: number;
}

export interface EditorialTopic {
  keyword: string;
  category: TopicCategory;
  angle: string;
}

export interface CrossPromoTopic {
  keyword: string;
  angle: string;
  category?: TopicCategory;
}

export interface ExistingPost {
  slug: string;
  title: string;
}

export interface GeneratedBlogPost {
  title: string;
  slug: string;
  description: string;
  category: TopicCategory;
  answer: string;
  readMins: number;
  tags: string[];
  /** Model-written literal description of the hero scene; the engine brands it. */
  heroImageAlt?: string;
  faqs: Array<{ q: string; a: string }>;
  body: string;
}

export interface CoverImage {
  image: string;
  imageAlt: string;
  ogImage: string;
  source: 'ai-generated' | 'curated-fallback' | 'watermarked-fallback';
}

export interface GscQuery {
  query: string;
  impressions: number;
}

export interface GenerateRunOptions {
  count: number;
  dryRun: boolean;
  skipPing: boolean;
}

export interface GenerateRunResult {
  written: string[];
  skipped?: string;
}

export interface BlogEngineConfig {
  identity: {
    name: string;
    siteUrl: string;
    siteHost: string;
    agent: {
      name: string;
      title: string;
      titleCap: string;
      license: string;
      since?: number;
    };
    areas: readonly string[];
    voice: { name: string; homeCtaPath: string; valuationPath?: string };
    backlink: { url: string; deepLink: string };
  };
  paths: {
    blogDir: string;
    assetDir: string;
    heroDir: string;
    brandLogo: string;
    watermarkLogo: string;
  };
  gsc: {
    property: string;
    sitemap: string;
  };
  indexNow: {
    key: string;
  };
  text: {
    /** 'openrouter' is the default; 'openai-compatible' works with any /chat/completions endpoint. */
    provider: 'openrouter' | 'openai-compatible';
    url: string;
    model: string;
    maxTokens: number;
    temperature: number;
    /** Env var holding the bearer token. Defaults to OPENROUTER_API_KEY. */
    apiKeyEnv?: string;
    /** Extra headers merged into the request (e.g. provider routing headers). */
    headers?: Record<string, string>;
  };
  /** Optional overrides for the ASEO content contract. Defaults are production-proven. */
  content?: BlogContentRules;
  image: {
    model: string;
    size: '1024x1024' | '1536x1024' | '1024x1536' | `${number}x${number}`;
    quality: string;
    format: 'webp' | 'jpg' | 'png';
    credit: string;
    promptMarket: string;
    promptStyle: string;
    promptCamera: string;
    watermark: {
      width: number;
      opacity: number;
      margin: number;
    };
    og: {
      width: number;
      height: number;
      colors: {
        bg: string;
        bg2: string;
        gold: string;
        gold2: string;
        text: string;
        dim: string;
      };
      titleFont: string;
      uiFont: string;
    };
  };
  rss: {
    title: string;
    description: string;
    path: string;
    limit: number;
  };
  logPrefix?: string;
}

export interface BlogEngineTopics {
  allowedCategories: readonly TopicCategory[];
  crossPromoEvery: number;
  gradients: readonly string[];
  heroPhotos: readonly { url: string; alt: string }[];
  internalLinks: readonly string[];
  editorial: readonly EditorialTopic[];
  crossPromo: readonly CrossPromoTopic[];
  categoryForQuery?: (query: string) => TopicCategory;
  gscAngleForQuery?: (query: string) => string;
}

export interface BlogContentRules {
  /** Minimum body word count (default 450). */
  minBodyWords?: number;
  /** Soft ceiling for meta descriptions before deterministic clamping (default 300). */
  maxDescriptionChars?: number;
  /** Hard length descriptions are clamped to on a word boundary (default 158). */
  clampDescriptionTo?: number;
  /** Minimum H2 headings phrased as questions (default 2). Set 0 to disable. */
  minQuestionH2s?: number;
  /** Require one self-contained citable blockquote in the body (default true). */
  requireCitableBlockquote?: boolean;
  /** Case-insensitive phrases that block publication (claims discipline). */
  blockedPhrases?: readonly string[];
}

export interface GenerateTextArgs {
  messages: Array<{ role: string; content: string }>;
  text: BlogEngineConfig['text'];
}

export interface GenerateHeroImageArgs {
  prompt: string;
  post: GeneratedBlogPost;
  topic: SeoTopic;
}

/**
 * Infrastructure seams. Provide these to run the engine on your own model
 * stack; leave them out to use the built-in OpenRouter + Vercel AI Gateway
 * defaults. generateText returns the raw model text (strict JSON expected);
 * generateHeroImage returns a raw image buffer (the engine watermarks,
 * converts, and writes it) or null to use the curated fallback.
 */
export interface BlogEngineHooks {
  generateText?: (args: GenerateTextArgs) => Promise<string>;
  generateHeroImage?: (args: GenerateHeroImageArgs) => Promise<Buffer | null>;
}

export interface BlogEngineRuntime {
  config: BlogEngineConfig;
  topics: BlogEngineTopics;
  brandPersona: () => string;
  hooks?: BlogEngineHooks;
}

export interface BlogAnswerSection {
  heading: string;
  answer: string;
  body: string;
}

export interface ParsedBlogFaq {
  question: string;
  answer: string;
}

export interface ParsedBlogPost {
  slug: string;
  title: string;
  description: string;
  category: TopicCategory;
  tags: string[];
  author: string;
  publishedAt: string;
  updatedAt: string;
  heroImage: string;
  heroImageAlt: string;
  ogImage?: string;
  readMins?: number;
  answer: string;
  content: string;
  faqs: ParsedBlogFaq[];
  body: BlogAnswerSection[];
}

export interface SeedBlogPost {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags?: string[];
  author?: string;
  publishedAt: string;
  updatedAt?: string;
  heroImage: string;
  heroImageAlt?: string;
  ogImage?: string;
  readMins?: number;
  answer?: string;
  content?: string;
  faqs?: ParsedBlogFaq[];
  body?: BlogAnswerSection[];
}

export interface ReadGeneratedPostsOptions {
  root?: string;
  blogDir?: string;
  fallback?: {
    title?: string;
    description: string;
    category?: string;
    tags?: string[];
    author: string;
    heroImage: string;
    heroImageAltPrefix: string;
  };
}

export interface TemplateSiteProfile {
  id: string;
  brand: string;
  legalName: string;
  domain: string;
  description: string;
  industry: string;
  primaryMarket: string;
  region: string;
  schemaType: string;
  theme: {
    ink: string;
    muted: string;
    paper: string;
    surface: string;
    primary: string;
    accent: string;
  };
  hero: {
    image: string;
  };
  services: readonly {
    slug: string;
    title: string;
    summary: string;
  }[];
  markets: readonly string[];
  collections: readonly {
    title: string;
    image?: string;
    imageAlt?: string;
  }[];
  blogPosts: readonly SeedBlogPost[];
  businessRunner: {
    agentName: string;
    poweredByUrl: string;
  };
}

export interface TemplateRuntimeOptions {
  blogDir?: string;
  assetDir?: string;
  heroDir?: string;
  brandLogo?: string;
  watermarkLogo?: string;
  indexNowKey?: string;
  textModel?: string;
  imageModel?: string;
  imageSize?: BlogEngineConfig['image']['size'];
  imageFormat?: BlogEngineConfig['image']['format'];
  rssLimit?: number;
  extraInternalLinks?: readonly string[];
}
