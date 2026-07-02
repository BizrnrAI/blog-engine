import { getBlogTopics } from './config';
function proxiedArray(select) {
    return new Proxy([], {
        get(_target, prop) {
            const selected = select();
            const value = selected[prop];
            return typeof value === 'function' ? value.bind(selected) : value;
        },
    });
}
export const ALLOWED_CATEGORIES = proxiedArray(() => getBlogTopics().allowedCategories);
export const GRADIENTS = proxiedArray(() => getBlogTopics().gradients);
export const HERO_PHOTOS = proxiedArray(() => getBlogTopics().heroPhotos);
export const INTERNAL_LINKS = proxiedArray(() => getBlogTopics().internalLinks);
export const EDITORIAL_TOPICS = proxiedArray(() => getBlogTopics().editorial);
export const CROSS_PROMO_TOPICS = proxiedArray(() => getBlogTopics().crossPromo);
//# sourceMappingURL=topics.js.map