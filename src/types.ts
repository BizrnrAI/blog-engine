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
    provider: 'openrouter';
    url: string;
    model: string;
    maxTokens: number;
    temperature: number;
  };
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

export interface BlogEngineRuntime {
  config: BlogEngineConfig;
  topics: BlogEngineTopics;
  brandPersona: () => string;
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
