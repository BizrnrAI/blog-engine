import type { BlogEngineRuntime } from '../../src/index.js';
import { BLOG_CONFIG, brandPersona } from './config.js';
import {
  ALLOWED_CATEGORIES,
  CROSS_PROMO_EVERY,
  CROSS_PROMO_TOPICS,
  EDITORIAL_TOPICS,
  GRADIENTS,
  HERO_PHOTOS,
  INTERNAL_LINKS,
} from './topics.js';
import type { TopicCategory } from '../../src/index.js';

function categoryForQuery(q: string): TopicCategory {
  const t = q.toLowerCase();
  if (/(sell|selling|worth|valuation|list my)/.test(t)) return 'Selling';
  if (/(market|trend|forecast|prices?)/.test(t)) return 'Market Insights';
  if (/(la jolla|del mar|coronado|rancho santa fe|carlsbad|encinitas|downtown|point loma|pacific beach|neighborhood)/.test(t)) return 'Neighborhoods';
  if (/(move|moving|relocat|family|families|lifestyle|best place)/.test(t)) return 'Lifestyle';
  return 'Buying';
}

export function sdbgBlogRuntime(): BlogEngineRuntime {
  return {
    config: BLOG_CONFIG,
    brandPersona,
    topics: {
      allowedCategories: [...ALLOWED_CATEGORIES],
      crossPromoEvery: CROSS_PROMO_EVERY,
      gradients: [...GRADIENTS],
      heroPhotos: [...HERO_PHOTOS],
      internalLinks: [...INTERNAL_LINKS],
      editorial: EDITORIAL_TOPICS,
      crossPromo: CROSS_PROMO_TOPICS,
      categoryForQuery,
      gscAngleForQuery: (query: string) => `directly answer the search intent behind "${query}" for a San Diego buyer or seller`,
    },
  };
}
