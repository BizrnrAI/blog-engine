import type { BlogEngineConfig, BlogEngineHooks, BlogEngineRuntime, BlogEngineTopics } from './types.js';
import { assertBlogEngineRuntime } from './validate-runtime.js';

let runtime: BlogEngineRuntime | null = null;

/**
 * Install the adapter. The runtime is validated here so a malformed adapter fails immediately with
 * a list of what to fix, rather than deep inside the image pipeline or after a paid model call.
 * Pass `{ validate: false }` only to inspect a deliberately partial config (tests, tooling).
 */
export function configureBlogEngine(nextRuntime: BlogEngineRuntime, options: { validate?: boolean } = {}): void {
  if (options.validate !== false) assertBlogEngineRuntime(nextRuntime);
  runtime = nextRuntime;
}

export function getBlogRuntime(): BlogEngineRuntime {
  if (!runtime) {
    throw new Error(
      'Blog engine runtime has not been configured. Call configureBlogEngine({ config, topics, brandPersona }) before using the engine.',
    );
  }
  return runtime;
}

export function getBlogConfig(): BlogEngineConfig {
  return getBlogRuntime().config;
}

export function getBlogTopics(): BlogEngineTopics {
  return getBlogRuntime().topics;
}

/** Normalized post URL prefix, no trailing slash (default '/blog'). */
export function blogBasePath(): string {
  const raw = getBlogConfig().paths.blogBasePath || '/blog';
  const cleaned = '/' + raw.replace(/^\/+|\/+$/g, '');
  return cleaned === '/' ? '' : cleaned;
}

/**
 * Pure canonical URL formatter used by every public blog surface.
 *
 * Keeping this independent of the installed runtime lets schema/discovery
 * builders honor explicit standalone options while sharing the exact same
 * slash policy as configured sites.
 */
export function formatBlogPath(
  basePath: string,
  slug?: string,
  trailingSlash = false,
): string {
  const cleanedBase = '/' + String(basePath || '').replace(/^\/+|\/+$/g, '');
  const base = cleanedBase === '/' ? '' : cleanedBase;
  const cleanSlug = slug == null ? '' : String(slug).replace(/^\/+|\/+$/g, '');
  const path = cleanSlug ? `${base}/${cleanSlug}` : (base || '/');
  if (!trailingSlash || path === '/') return path;
  return `${path}/`;
}

/** Pure absolute counterpart to formatBlogPath(). */
export function formatBlogUrl(
  siteUrl: string,
  basePath: string,
  slug?: string,
  trailingSlash = false,
): string {
  return new URL(formatBlogPath(basePath, slug, trailingSlash), siteUrl).href;
}

/** Canonical relative URL for the blog hub. */
export function blogHubPath(): string {
  return formatBlogPath(blogBasePath(), undefined, Boolean(getBlogConfig().paths.trailingSlash));
}

/** Canonical absolute URL for the blog hub. */
export function blogHubUrl(): string {
  return formatBlogUrl(
    getBlogConfig().identity.siteUrl,
    blogBasePath(),
    undefined,
    Boolean(getBlogConfig().paths.trailingSlash),
  );
}

/** Canonical relative URL for one post, honoring the adopting site's policy. */
export function blogPostPath(slug: string): string {
  return formatBlogPath(blogBasePath(), slug, Boolean(getBlogConfig().paths.trailingSlash));
}

/** Canonical absolute URL for one post. */
export function blogPostUrl(slug: string): string {
  return formatBlogUrl(
    getBlogConfig().identity.siteUrl,
    blogBasePath(),
    slug,
    Boolean(getBlogConfig().paths.trailingSlash),
  );
}

/** True when this site persists posts somewhere other than the filesystem. */
export function hasRemoteStore(): boolean {
  try {
    return Boolean(getBlogRuntime().hooks?.store);
  } catch {
    return false;
  }
}

export function getBlogHooks(): BlogEngineHooks {
  return getBlogRuntime().hooks || {};
}

export function brandPersona(): string {
  return getBlogRuntime().brandPersona();
}

export const BLOG_CONFIG = new Proxy({} as BlogEngineConfig, {
  get(_target, prop: keyof BlogEngineConfig) {
    return getBlogConfig()[prop];
  },
});
