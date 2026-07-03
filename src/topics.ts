import { getBlogTopics } from './config.js';
import type { CrossPromoTopic, EditorialTopic, TopicCategory } from './types.js';

function proxiedArray<T>(select: () => readonly T[]): T[] {
  return new Proxy([] as T[], {
    get(_target, prop) {
      const selected = select();
      const value = (selected as any)[prop as any];
      return typeof value === 'function' ? value.bind(selected) : value;
    },
  });
}

export const ALLOWED_CATEGORIES = proxiedArray<TopicCategory>(() => getBlogTopics().allowedCategories);
export const GRADIENTS = proxiedArray<string>(() => getBlogTopics().gradients);
export const HERO_PHOTOS = proxiedArray<{ url: string; alt: string }>(() => getBlogTopics().heroPhotos);
export const INTERNAL_LINKS = proxiedArray<string>(() => getBlogTopics().internalLinks);
export const EDITORIAL_TOPICS = proxiedArray<EditorialTopic>(() => getBlogTopics().editorial);
export const CROSS_PROMO_TOPICS = proxiedArray<CrossPromoTopic>(() => getBlogTopics().crossPromo);
