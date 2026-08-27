export type TopicCategory = string;
export interface SeoTopic {
    type: 'gsc' | 'editorial' | 'crosspromo';
    keyword: string;
    category: TopicCategory;
    angle: string;
    mustBacklink: boolean;
    impressions?: number;
    /**
     * Pin the published slug exactly (no slugify, no stop-word stripping). Use when a curated
     * catalog owns its URLs. The engine instructs the model, enforces the value deterministically
     * in normalizeGeneratedPost, and validateGeneratedPost asserts it.
     */
    slug?: string;
    /** Pin the published title exactly. Same enforcement path as slug. */
    title?: string;
}
export interface EditorialTopic {
    keyword: string;
    category: TopicCategory;
    angle: string;
    /** Curated slug: pins the URL and makes coverage detection exact instead of heuristic. */
    slug?: string;
    /** Curated title: pins the headline and makes coverage detection exact instead of heuristic. */
    title?: string;
}
export interface CrossPromoTopic {
    keyword: string;
    angle: string;
    category?: TopicCategory;
}
export interface ExistingPost {
    slug: string;
    title: string;
    /** ISO publish date from frontmatter, when present (used by the cadence guard). */
    date?: string;
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
    faqs: Array<{
        q: string;
        a: string;
    }>;
    body: string;
    /** Verified external sources (opt-in via content.requireSources). */
    sources?: BlogSource[];
}
export interface ValidatePostArgs {
    post: GeneratedBlogPost;
    topic: SeoTopic;
    operation: 'generate' | 'refresh';
}
export interface BlogSource {
    title: string;
    url: string;
    publisher?: string;
}
export interface CoverImage {
    image: string;
    imageAlt: string;
    ogImage: string;
    source: 'ai-generated' | 'curated-fallback' | 'watermarked-fallback';
    /** Intrinsic pixel dimensions of the hero when the engine wrote it (CLS-safe rendering). */
    width?: number;
    height?: number;
    /** Responsive variants written alongside the hero, as an HTML srcset string. */
    srcset?: string;
}
export interface GscQuery {
    query: string;
    impressions: number;
}
/** One Search Console row at page × query granularity (28-day window). */
export interface GscPageQuery {
    page: string;
    query: string;
    impressions: number;
    clicks: number;
    position: number;
}
export type RankRescueAction = 'refresh' | 'authority' | 'audit' | 'title-experiment' | 'leave-alone';
/** Search intent of a query, used to bias topic choice and citation probes. */
export type QueryIntent = 'verification' | 'commercial' | 'informational';
export interface CannibalizationPair {
    query: string;
    pages: Array<{
        page: string;
        impressions: number;
        position: number;
    }>;
}
export interface UrlInspection {
    /** Search Console coverage state, verbatim (e.g. 'Submitted and indexed'). */
    coverageState: string;
    lastCrawlTime?: string;
    referringUrls?: string[];
}
export interface RankRescueCandidate {
    page: string;
    slug: string;
    impressions: number;
    clicks: number;
    ctr: number;
    position: number;
    score: number;
    action: RankRescueAction;
    /** Top queries by impressions for this page — fed to refresh mode. */
    queries: Array<{
        query: string;
        impressions: number;
        position: number;
    }>;
}
export interface RefreshRunOptions {
    /** When Search Console yields no candidates, refresh the worst-audited FIX post instead (default true). */
    backlog?: boolean;
    /** Explicit slugs to refresh; when empty, rank-rescue picks candidates from Search Console. */
    slugs?: string[];
    /** Max posts to refresh this run when picking automatically (default 1). */
    max?: number;
    dryRun: boolean;
}
export interface RefreshRunResult {
    refreshed: string[];
    candidates: RankRescueCandidate[];
    skipped?: string;
}
export type CorpusVerdict = 'SHIP' | 'FIX' | 'BLOCK';
export interface CorpusAuditEntry {
    slug: string;
    verdict: CorpusVerdict;
    issues: string[];
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
        /** BCP-47 locale for feeds/schema (default 'en-US'). */
        locale?: string;
        /**
         * Where a reader should be sent to convert, e.g. '/contact'. Defaults to '/'.
         * Pair with `content.ctaInstruction` to control the wording.
         */
        ctaPath?: string;
        /**
         * An AI voice agent, if the brand runs one. Optional: with no voice configured the engine
         * writes a plain call-to-action instead of asking readers to call an assistant.
         */
        voice?: {
            name: string;
            homeCtaPath: string;
            secondaryCtaPath?: string;
        };
        /**
         * The accountable human author for E-E-A-T. Emitted into frontmatter (`author`) and used as
         * the default BlogPosting author entity; `id` should be the stable Person @id your site
         * already publishes (e.g. `https://example.com/#person`).
         */
        author?: {
            name: string;
            url?: string;
            id?: string;
        };
        /**
         * A partner/parent site to cross-promote. Optional: with no backlink configured the engine
         * skips cross-promo posts entirely rather than inventing an outbound link.
         */
        backlink?: {
            url: string;
            deepLink: string;
        };
    };
    paths: {
        /** URL path prefix for posts (default '/blog'); e.g. '/log' for a site whose posts live at /log/<slug>. */
        blogBasePath?: string;
        /** Emit canonical post URLs with a trailing slash. Default false. */
        trailingSlash?: boolean;
        /**
         * Extra frontmatter key aliases (alias -> canonical engine key), merged OVER
         * DEFAULT_FRONTMATTER_ALIASES (pubDate->date, updatedDate->updated, cover->image,
         * coverAlt->imageAlt, readingTime->readMins, ...). Only needed for shapes the defaults miss,
         * e.g. { summary: 'description' }.
         */
        frontmatterAliases?: Readonly<Record<string, string>>;
        blogDir: string;
        /**
         * File extensions the readers treat as posts (default ['.md']). Add '.mdx' for an MDX corpus.
         * Generated posts are still written with the FIRST extension in the list.
         */
        contentExtensions?: readonly string[];
        assetDir: string;
        heroDir: string;
        brandLogo: string;
        watermarkLogo: string;
    };
    gsc: {
        property: string;
        /** Primary sitemap retained for backward compatibility. */
        sitemap: string;
        /** Additional sitemap URLs submitted alongside `sitemap`. */
        sitemaps?: readonly string[];
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
        /** Responsive widths to write next to the hero (e.g. [1024, 640]); emitted as imageSrcset. */
        variants?: readonly number[];
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
    heroPhotos: readonly {
        url: string;
        alt: string;
    }[];
    internalLinks: readonly string[];
    editorial: readonly EditorialTopic[];
    crossPromo: readonly CrossPromoTopic[];
    categoryForQuery?: (query: string) => TopicCategory;
    gscAngleForQuery?: (query: string) => string;
    /**
     * Canonical owner pages for the site's commercial queries (e.g. '/buy', '/pricing'). Posts are
     * instructed to SUPPORT these — link the most relevant one — and never compete with them for the
     * same query. One owner per query family is the core ASEO ownership rule.
     */
    ownerPages?: readonly string[];
    /**
     * Drop a Search Console query from topic selection (e.g. a query family another owned site
     * already serves). Applied after the engine's own filters, to built-in and hook sources alike.
     */
    excludeQuery?: (query: string) => boolean;
    /** Allowed hosts for post sources when content.requireSources is on (suffix match, e.g. 'census.gov'). */
    trustedSourceDomains?: readonly string[];
    /**
     * Classify a query's intent. Default heuristic marks question/verification wording
     * ("is X legit", "does X work", "X vs Y", "X reviews") as 'verification'.
     */
    intentForQuery?: (query: string) => QueryIntent;
    /**
     * Rank verification-intent queries ahead of commercial ones when choosing a topic.
     * Default FALSE (topic order unchanged). Measured basis: on the reference property every
     * AI citation came from a verification-intent query family and none from a commercial one,
     * while the head commercial term earned 338 impressions and 0 clicks at position 24.8.
     */
    preferVerificationIntent?: boolean;
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
     * Minimum days between refreshes of the same post (default 45). A change needs 2-45 days to
     * surface across engines, so rewriting sooner destroys the evidence for whether it worked.
     */
    minDaysBetweenRefresh?: number;
    /**
     * Cadence cap: skip the run when this many posts were already published in the trailing 7 days.
     * The ASEO skill's default for search-led autonomous posts is 2 per rolling week until reviewed
     * evidence supports more. Unset = no cap (existing behaviour).
     */
    maxPostsPerWeek?: number;
    /**
     * Require a second, independent demand signal (autocomplete or a fetchDemandSignals hook)
     * before a Search-Console-led topic may become a new post. Default false.
     */
    requireTwoDemandSignals?: boolean;
    /**
     * Require 2–4 verified external sources per post (opt-in). Sources must resolve (HEAD/GET 2xx)
     * and, when topics.trustedSourceDomains is set, come from those domains. Default false.
     */
    requireSources?: boolean;
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
    messages: Array<{
        role: string;
        content: string;
    }>;
    text: BlogEngineConfig['text'];
}
export interface GenerateHeroImageArgs {
    prompt: string;
    post: GeneratedBlogPost;
    topic: SeoTopic;
}
export interface FetchGscPageQueriesArgs {
    property: string;
    siteUrl: string;
    days: number;
    /** Only pages whose path starts with this prefix matter (default '/blog/'). */
    pathPrefix: string;
}
export interface CitationProbe {
    provider: string;
    probeType: string;
    available: boolean;
    mentioned: boolean;
    answerExcerpt?: string;
    citedUrls: string[];
    model?: string;
    checkedAt: string;
    errorCode?: string;
}
export interface ScorecardCheck {
    name: string;
    status: 'pass' | 'warn' | 'fail' | 'na';
    detail: string;
}
export interface Scorecard {
    generatedAt: string;
    site: string;
    checks: ScorecardCheck[];
    summary: string;
    failing: number;
    warning: number;
}
export interface AfterIndexedArgs {
    urls: string[];
    slugs: string[];
}
export interface FetchGscQueriesArgs {
    /** The configured Search Console property, e.g. `sc-domain:example.com`. */
    property: string;
    siteUrl: string;
    /** Lookback window the engine wants, in days. */
    days: number;
}
export interface SubmitSitemapArgs {
    /** One absolute sitemap URL from config (`gsc.sitemap` plus `gsc.sitemaps`). */
    sitemap: string;
    property: string;
}
export interface ParseFrontmatterArgs {
    /** Raw file contents, frontmatter included. */
    raw: string;
    slug: string;
}
export interface ParsedFrontmatterResult {
    frontmatter: Record<string, string>;
    content: string;
    faqs: ParsedBlogFaq[];
    tags: string[];
    sources?: BlogSource[];
}
export interface PickTopicArgs {
    existing: ExistingPost[];
    gscQueries: GscQuery[];
    /** Index of this post within the current run (0-based). */
    offset: number;
}
export interface DeriveTopicArgs {
    existing: ExistingPost[];
}
export interface PutPostArgs {
    post: GeneratedBlogPost;
    cover: CoverImage;
    /** The rendered file body — kept verbatim so a remote store can export back to files losslessly. */
    markdown: string;
    /** Publish date for a new post; for a refresh only the updated date moves. */
    dateISO: string;
    isRefresh: boolean;
}
/**
 * Where posts and their assets live. The filesystem store is the default and reproduces the
 * engine's original behaviour exactly; a Supabase store turns publishing into an upsert with no
 * git, CI, or rebuild in the path. Everything in the pipeline reads and writes through this.
 */
export interface BlogStore {
    /** Human-readable name, used in logs. */
    name: string;
    /** Persistence status, exposed so the service can verify review policy. */
    publicationStatus?: BlogPublicationStatus;
    /** Repository root, when the store is filesystem-backed. */
    root?: string;
    /** Every post the site has published, newest first is not required. */
    listPosts: () => Promise<ParsedBlogPost[]>;
    /** Persist a post; returns an identifier for logging (a path, or table:site/slug). */
    putPost: (args: PutPostArgs) => Promise<string>;
    /** Store a hero/OG asset and return the URL the post should reference. */
    putAsset?: (key: string, data: Buffer, contentType: string) => Promise<string>;
}
/** One site the blog service publishes for. */
export interface ServiceSite {
    /** Stable id (use the registry's site_key). */
    id: string;
    /** Build this site's runtime. Async so config can come from a registry query. */
    runtime: (context?: ServiceRuntimeContext) => BlogEngineRuntime | Promise<BlogEngineRuntime>;
    /** Filesystem root; only meaningful for filesystem-backed sites. */
    root?: string;
    /** Posts per run (default 1). */
    count?: number;
    /** UTC weekdays this site publishes on (0=Sun). Omit for every run. */
    days?: readonly number[];
    /** Bounded UTC window when the site is due daily; `endsAt` is exclusive. */
    dailyCampaign?: {
        startsAt: string;
        endsAt: string;
    };
    /** Set false to pause a site without deleting its entry. */
    enabled?: boolean;
    /**
     * Where a successful generation lands. Use review for legal, medical,
     * financial, and other YMYL content. The service will not submit a staged
     * URL to search engines before a separate release action publishes it.
     */
    publicationStatus?: BlogPublicationStatus;
}
export type BlogPublicationStatus = 'draft' | 'review' | 'published';
export interface ServiceRuntimeContext {
    publicationStatus: BlogPublicationStatus;
}
export interface ServiceRunResult {
    site: string;
    status: 'published' | 'queued-for-review' | 'drafted' | 'nothing-to-do' | 'skipped' | 'failed';
    detail?: string;
    published: string[];
    /** Generated but deliberately not public or submitted to search engines. */
    staged?: string[];
    refreshed: string[];
    ms?: number;
}
export interface SupabaseStoreOptions {
    /** Project URL; defaults to SUPABASE_URL. */
    url?: string;
    /** Service-role key; defaults to SUPABASE_SERVICE_ROLE_KEY. Never ship this to a browser. */
    serviceKey?: string;
    /** Tenant key — one row-space per site. */
    siteId: string;
    /** Table name (default 'blog_posts'). */
    table?: string;
    /** Storage bucket for heroes/OG cards (default 'blog-assets'). */
    bucket?: string;
    /** Postgres schema (default 'public'). */
    schema?: string;
    /** CDN origin serving the bucket, if you front it. */
    publicBaseUrl?: string;
    /** Author recorded on written rows. */
    author?: string;
    /** Write posts as 'draft' instead of 'published' (human release step). */
    publishStatus?: 'draft' | 'published';
    /** Include drafts when listing (default false). */
    includeDrafts?: boolean;
}
export interface AllWebStoreOptions {
    /** Site-agent Edge Function URL; defaults to ALLWEB_SITE_AGENT_URL. */
    apiUrl?: string;
    /** Exact site-scoped token; defaults to ALLWEB_SITE_TOKEN. Never use a Supabase service role. */
    token?: string;
    /** Immutable AllWeb site UUID from website.manifest.json. */
    siteId: string;
    /** Author recorded on written rows. */
    author?: string;
    /** Write posts as drafts instead of publishing immediately. */
    publishStatus?: BlogPublicationStatus;
    /** Include non-published posts during corpus operations. */
    includeDrafts?: boolean;
    /** Abort an unresponsive gateway request after this many milliseconds (default 8000). */
    timeoutMs?: number;
    /** Page size used while reading a corpus (default 200, max 250). */
    pageSize?: number;
}
/** Exact least-privilege client used to release an already-reviewed AllWeb row. */
export interface AllWebReviewerOptions {
    /** Site-agent Edge Function URL. */
    apiUrl: string;
    /** Reviewer token with exactly site:read, blog:read, and blog:publish. */
    token: string;
    /** Immutable AllWeb site UUID from website.manifest.json. */
    siteId: string;
    /** Abort an unresponsive gateway request after this many milliseconds (default 8000). */
    timeoutMs?: number;
    /**
     * Validate the exact tenant-checked review row immediately before mutation. Use this for the
     * adopter's engine and rendering contracts; generation validation alone is insufficient because
     * a review row may be edited before release. Any returned complaint fails closed.
     */
    validatePost?: (args: ValidateReviewedAllWebPostArgs) => string[] | Promise<string[]>;
}
/** Exact AllWeb row shape exposed to a release preflight, with no credential or transport data. */
export interface ReviewedAllWebPost extends GeneratedBlogPost {
    siteId: string;
    status: 'review';
    revision: number;
    author: string;
    heroImage: string;
    heroImageAlt: string;
    heroImageWidth?: number;
    heroImageHeight?: number;
    heroImageSrcset?: string;
    ogImage?: string;
}
export interface ValidateReviewedAllWebPostArgs {
    /** The exact row whose revision will be passed to blog_publish. */
    post: ReviewedAllWebPost;
    /** Published corpus available for slug/link validation; never includes the candidate. */
    existingPublishedSlugs: string[];
}
export interface ReleaseReviewedAllWebPostArgs {
    slug: string;
    /** Revision the accountable reviewer actually inspected. */
    expectedRevision: number;
    /** Optional explicit publication timestamp accepted by the gateway. */
    publishedAt?: string;
}
export interface ReleaseReviewedAllWebPostResult {
    slug: string;
    revision: number;
    status: 'published';
    /** False when a retry finds that this exact reviewed revision is already public. */
    changed: boolean;
}
export interface AllWebReviewer {
    /**
     * Verify tenant and exact reviewer scope, require review state + optimistic revision,
     * then publish. A retry after publication is idempotent for expectedRevision + 1.
     */
    releaseReviewedPost: (args: ReleaseReviewedAllWebPostArgs) => Promise<ReleaseReviewedAllWebPostResult>;
}
/** A tenant-verified row returned by the AllWeb rendering client. */
export interface AllWebBlogPost extends ParsedBlogPost {
    /** Immutable AllWeb site UUID supplied by the gateway row. */
    siteId: string;
    status: string;
    revision: number;
}
export interface AllWebBlogReaderOptions {
    /** Site-agent Edge Function URL; defaults to ALLWEB_SITE_AGENT_URL. */
    apiUrl?: string;
    /** Exact site-scoped token; defaults to ALLWEB_SITE_TOKEN. */
    token?: string;
    /** Immutable AllWeb site UUID from website.manifest.json. */
    siteId: string;
    /** Abort an unresponsive gateway request after this many milliseconds (default 5000). */
    timeoutMs?: number;
    /** In-process read cache lifetime (default 30000ms; set 0 to disable). */
    cacheTtlMs?: number;
    /** Page size used while reading the corpus (default 200, max 250). */
    pageSize?: number;
    /** Return []/null and report errors instead of throwing (default true for public rendering). */
    failClosed?: boolean;
    /** Optional structured error reporter; defaults to console.error. */
    onError?: (operation: string, error: Error) => void;
}
export interface AllWebBlogReader {
    /** Every published post, following AllWeb pagination until the corpus is complete. */
    listPublishedPosts: (options?: {
        includeContent?: boolean;
        force?: boolean;
    }) => Promise<AllWebBlogPost[]>;
    /** One published post by slug. Draft/review/archived rows are returned as null. */
    getPublishedPost: (slug: string, options?: {
        force?: boolean;
    }) => Promise<AllWebBlogPost | null>;
    /** Drop all in-process list and slug caches. */
    invalidate: () => void;
}
export interface ResilientAllWebBlogReaderOptions extends Omit<AllWebBlogReaderOptions, 'failClosed'> {
}
export interface AllWebBlogListResult {
    posts: AllWebBlogPost[];
    /** True when a live or last-known-good response is safe to render. */
    available: boolean;
    /** True only when the current read failed and the value is last-known-good. */
    stale: boolean;
}
export interface AllWebBlogPostResult {
    post: AllWebBlogPost | null;
    available: boolean;
    stale: boolean;
}
export interface AllWebBlogReaderHealth {
    lastOkAt: string | null;
    lastErrorAt: string | null;
    /** Sanitized code; never contains credentials, URLs, or response bodies. */
    lastErrorCode: string | null;
    warmCorpus: number | null;
    warmPosts: number;
}
export interface ResilientAllWebBlogReader {
    listPublishedPosts: (options?: {
        includeContent?: boolean;
        force?: boolean;
    }) => Promise<AllWebBlogListResult>;
    getPublishedPost: (slug: string, options?: {
        force?: boolean;
    }) => Promise<AllWebBlogPostResult>;
    health: () => AllWebBlogReaderHealth;
    invalidate: (options?: {
        dropLastGood?: boolean;
    }) => void;
}
export interface PersistPostArgs {
    post: GeneratedBlogPost;
    cover: CoverImage;
    /** The rendered file body (engine frontmatter, or whatever renderMarkdown produced). */
    markdown: string;
    /** Absolute path the engine would have written to. */
    file: string;
    root: string;
    /** True for a refresh of an existing post, false for a new one. */
    isRefresh: boolean;
}
export interface RenderMarkdownArgs {
    post: GeneratedBlogPost;
    cover: CoverImage;
    gradient: string;
    dateISO: string;
    /** identity.author.name when configured. */
    author?: string;
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
    /** Site policy checks run inside the model retry loop, before assets or persistence. */
    validatePost?: (args: ValidatePostArgs) => string[] | Promise<string[]>;
    /**
     * Supply topic candidates from your own Search Console auth. The built-in reader needs an OAuth
     * refresh token; a site using a SERVICE ACCOUNT (or any other analytics source) provides this
     * instead. Returned queries still pass through the engine's own filters (>= 2 words, brand terms
     * removed, sorted by impressions), so the topic-selection invariants hold either way.
     * Return [] for "no candidates" — the engine falls back to the editorial pool.
     */
    fetchGscQueries?: (args: FetchGscQueriesArgs) => Promise<GscQuery[]>;
    /**
     * Page × query rows for rank rescue / refresh mode, with your own Search Console auth. Return
     * [] for "no data" — refresh mode then only runs for explicitly passed slugs.
     */
    fetchGscPageQueries?: (args: FetchGscPageQueriesArgs) => Promise<GscPageQuery[]>;
    /**
     * Runs after URLs are confirmed live and submitted (IndexNow/GSC) — the seam for syndication
     * (LinkedIn, X, GBP, newsletter). Failures are logged, never re-thrown: distribution must not
     * block or un-publish anything.
     */
    afterIndexed?: (args: AfterIndexedArgs) => Promise<void>;
    /** Second demand source for a query: return related real-world queries/suggestions (e.g. PAA, site search). */
    fetchDemandSignals?: (query: string) => Promise<string[]>;
    /** Verify a source URL resolves; default is a HEAD/GET fetch with timeout. */
    verifySource?: (url: string) => Promise<boolean>;
    /** Grounded citation probes across AI providers; unavailable providers must return available:false. */
    probeCitations?: (args: {
        queries: string[];
        siteHost: string;
    }) => Promise<CitationProbe[]>;
    /**
     * Inspect a URL's index state with your own Search Console auth (URL Inspection API).
     * Indexing — not ranking — is usually the binding constraint; without this the scorecard
     * cannot tell "not indexed" from "not checked".
     */
    inspectUrl?: (args: {
        url: string;
    }) => Promise<UrlInspection | null>;
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
    /**
     * Store the finished post somewhere other than the filesystem — a database row, a CMS API, an
     * object store. Return true when the engine should ALSO write the Markdown file (dual-write
     * during a migration); return false/void when the hook owns persistence entirely.
     * Default behaviour with no hook is unchanged: write the file.
     */
    persistPost?: (args: PersistPostArgs) => boolean | void | Promise<boolean | void>;
    /**
     * Replace the filesystem with another content store (e.g. createSupabaseStore(...)).
     * With no store the engine reads and writes Markdown files exactly as before.
     */
    store?: BlogStore;
    /**
     * Own the frontmatter parse entirely (a real YAML parser, a different file format, extra
     * fields). Return null to fall back to the engine parser + alias normalization. Keys returned
     * by the hook are alias-normalized too, so a hook may emit its native shape.
     */
    parseFrontmatter?: (args: ParseFrontmatterArgs) => ParsedFrontmatterResult | null;
    /**
     * Choose the topic for this post. Return null to fall back to the engine rotation
     * (cross-promo cadence -> GSC demand -> editorial pool). Use for a priority-ordered curated
     * catalog, an external content calendar, or any selection the engine cannot know about.
     */
    pickTopic?: (args: PickTopicArgs) => SeoTopic | null | Promise<SeoTopic | null>;
    /**
     * Produce a fresh editorial topic when every configured editorial topic is already covered,
     * so the pool never dries up. Without it the engine recycles the pool as it always has.
     */
    deriveTopic?: (args: DeriveTopicArgs) => EditorialTopic | Promise<EditorialTopic>;
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
    heroImageWidth?: number;
    heroImageHeight?: number;
    heroImageSrcset?: string;
    sources?: BlogSource[];
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
//# sourceMappingURL=types.d.ts.map