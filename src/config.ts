import type { BlogEngineConfig, BlogEngineRuntime, BlogEngineTopics } from './types';

let runtime: BlogEngineRuntime | null = null;

export function configureBlogEngine(nextRuntime: BlogEngineRuntime): void {
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

export function brandPersona(): string {
  return getBlogRuntime().brandPersona();
}

export const BLOG_CONFIG = new Proxy({} as BlogEngineConfig, {
  get(_target, prop: keyof BlogEngineConfig) {
    return getBlogConfig()[prop];
  },
});
