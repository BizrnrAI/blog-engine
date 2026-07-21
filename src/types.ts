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
    /**
     * The person or entity the content speaks for. Only `name` is required — `title`, `license`
     * and `since` describe credentialed professionals (an agent, a broker, a licensed trade) and
     * are simply omitted for a shop, a SaaS product, or anything else without a credential.
     */
    agent: {
      name: string;
      title?: string;
      titleCap?: string;
      license?: string;
      since?: number;
    };
    /** Geographic areas served. Omit for a business that is not location-bound. */
    areas?: readonly string[];
    /**
     * Where a reader should be sent to convert, e.g. '/contact'. Defaults to '/'.
     * Pair with `content.ctaInstruction` to control the wording.
     */
    ctaPath?: string;
    /**
     * An AI voice agent, if the brand runs one. Optional: with no voice configured the engine
     * writes a plain call-to-action instead of asking readers to call an assistant.
     */
    voice?: { name: string; homeCtaPath: string; secondaryCtaPath?: string };
    /**
     * A partner/parent site to cross-promote. Optional: with no backlink configured the engine
     * skips cross-promo posts entirely rather than inventing an outbound link.
     */
    backlink?: { url: string; deepLink: string };
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
      /**
       * Generate the branded SVG Open Graph card. Default TRUE (existing behaviour).
       * Set false when the hero image should serve as the OG card too — the engine then
       * reports the hero path as `ogImage` instead of writing a second asset per post.
       */
      enabled?: boolean;
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
  /**
   * Tone adjectives for the brand voice. Default: 'confident, clear, genuinely helpful'.
   * A local service business might use 'warm, local-insider, practical'.
   */
  tone?: string;
  /**
   * How the closing call-to-action should read. Default is a plain invitation to get in touch
   * via `identity.ctaPath`. Override for a specific conversion motion (book a demo, call a voice
   * assistant, request a quote).
   */
  ctaInstruction?: string;
  /**
   * How a cross-promo post should reference `identity.backlink`. Default is a neutral contextual
   * link. Override to frame the partner product in the brand's own terms.
   */
  crossPromoInstruction?: string;
  /**
   * Extra hard rules appended verbatim to the prompt — e.g. 'Never say "licensed"; this trade is
   * registered, not licensed.' This is the seam for domain-specific editorial law.
   */
  extraRules?: readonly string[];
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

export interface FetchGscQueriesArgs {
  /** The configured Search Console property, e.g. `sc-domain:example.com`. */
  property: string;
  siteUrl: string;
  /** Lookback window the engine wants, in days. */
  days: number;
}

export interface SubmitSitemapArgs {
  /** Absolute sitemap URL from config (`gsc.sitemap`). */
  sitemap: string;
  property: string;
}

export interface RenderMarkdownArgs {
  post: GeneratedBlogPost;
  cover: CoverImage;
  gradient: string;
  dateISO: string;
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
  /**
   * Supply topic candidates from your own Search Console auth. The built-in reader needs an OAuth
   * refresh token; a site using a SERVICE ACCOUNT (or any other analytics source) provides this
   * instead. Returned queries still pass through the engine's own filters (>= 2 words, brand terms
   * removed, sorted by impressions), so the topic-selection invariants hold either way.
   * Return [] for "no candidates" — the engine falls back to the editorial pool.
   */
  fetchGscQueries?: (args: FetchGscQueriesArgs) => Promise<GscQuery[]>;
  /**
   * Submit/refresh the sitemap after publishing, with your own auth. Takes precedence over the
   * built-in OAuth ping.
   */
  submitSitemap?: (args: SubmitSitemapArgs) => Promise<void>;
  /**
   * Serialize a post to its final Markdown. Provide this when the consuming site owns a different
   * frontmatter shape (different field names, FAQs rendered into the body, extra fields). The
   * engine still owns generation, validation, watermarking, encoding and the write itself — this
   * hook only decides what the file looks like.
   */
  renderMarkdown?: (args: RenderMarkdownArgs) => string;
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
