import { BLOG_CONFIG, getBlogHooks, getBlogTopics } from './config.js';
import {
  ALLOWED_CATEGORIES,
  CROSS_PROMO_TOPICS,
  EDITORIAL_TOPICS,
} from './topics.js';
import type { EditorialTopic, ExistingPost, GscQuery, SeoTopic, TopicCategory } from './types.js';
import { norm, slugify } from './utils.js';
import { classifyQueryIntent } from './rank-rescue.js';

/**
 * Map a search query to one of the site's categories.
 *
 * The default deliberately returns the site's FIRST allowed category rather than guessing from
 * keywords. A guess is only useful if the engine knows the industry, and it cannot — while a
 * category outside `allowedCategories` fails validation on every retry and kills the run. Sites
 * that want smarter routing supply `topics.categoryForQuery`; see examples/sdbg for one.
 */
function categoryForQuery(q: string): TopicCategory {
  const custom = getBlogTopics().categoryForQuery;
  if (custom) return custom(q);
  return ALLOWED_CATEGORIES[0];
}

/**
  * Has this topic already been published?
  *
  * A curated topic that pins its own slug/title is matched EXACTLY — the two-distinctive-words
  * heuristic below is a guess that misfires on question-style titles ("How do I ...?"), which
  * would silently skip catalog entries. The heuristic stays for topics that carry no pin, where
  * a keyword is all the engine has.
  */
function isCovered(topic: { keyword: string; slug?: string; title?: string }, existing: ExistingPost[]): boolean {
  if (topic.slug || topic.title) {
    return existing.some(
      (p) =>
        (topic.slug ? p.slug === topic.slug : false) ||
        (topic.title ? norm(p.title) === norm(topic.title) : false),
    );
  }
  const slug = slugify(topic.keyword);
  if (existing.some((p) => p.slug === slug)) return true;
  const distinctive = norm(topic.keyword).split(' ').filter((w) => w.length > 3).slice(0, 2);
  return existing.some((p) => {
    const t = norm(p.title);
    return distinctive.length >= 2 && distinctive.every((w) => t.includes(w));
  });
}

/** True when every configured editorial topic already has a published post. */
export function allEditorialTopicsCovered(existing: ExistingPost[]): boolean {
  return EDITORIAL_TOPICS.length > 0 && EDITORIAL_TOPICS.every((seed) => isCovered(seed, existing));
}

export function pickTopic(existing: ExistingPost[], gscQueries: GscQuery[], offset: number): SeoTopic {
  const idx = existing.length + offset;
  const topics = getBlogTopics();
  // Cross-promo only makes sense with a partner site to link to. With no backlink configured the
  // engine skips the cadence entirely rather than inventing an outbound link.
  const canCrossPromo = Boolean(BLOG_CONFIG.identity.backlink) && CROSS_PROMO_TOPICS.length > 0;
  if (canCrossPromo && idx % topics.crossPromoEvery === topics.crossPromoEvery - 1) {
    for (let i = 0; i < CROSS_PROMO_TOPICS.length; i++) {
      const seed = CROSS_PROMO_TOPICS[(idx + i) % CROSS_PROMO_TOPICS.length];
      if (!isCovered(seed, existing)) {
        return {
          type: 'crosspromo',
          keyword: seed.keyword,
          category: seed.category || ALLOWED_CATEGORIES[0],
          angle: seed.angle,
          mustBacklink: true,
        };
      }
    }
  }

  if (idx % 2 === 0) {
    // Optional: answer verification-intent questions before commercial ones. Impressions alone
    // are a poor ranking signal for topic choice — head commercial terms routinely earn many
    // impressions and no clicks, while long-tail verification questions convert and get cited.
    const ordered = topics.preferVerificationIntent
      ? [...gscQueries].sort((a, b) => Number(classifyQueryIntent(b.query) === 'verification') - Number(classifyQueryIntent(a.query) === 'verification'))
      : gscQueries;
    const hit = ordered.find((q) => !isCovered({ keyword: q.query }, existing));
    if (hit) {
      return {
        type: 'gsc',
        keyword: hit.query,
        category: categoryForQuery(hit.query),
        angle: topics.gscAngleForQuery?.(hit.query) || `directly answer the search intent behind "${hit.query}"`,
        mustBacklink: false,
        impressions: hit.impressions,
      };
    }
  }

  for (let i = 0; i < EDITORIAL_TOPICS.length; i++) {
    const seed = EDITORIAL_TOPICS[(idx + i) % EDITORIAL_TOPICS.length];
    if (!isCovered(seed, existing)) {
      return { type: 'editorial', ...seed, mustBacklink: false };
    }
  }

  const seed = EDITORIAL_TOPICS[idx % EDITORIAL_TOPICS.length];
  return { type: 'editorial', ...seed, mustBacklink: false };
}

/**
 * The topic the engine will actually write about: `hooks.pickTopic` first (a curated,
 * priority-ordered catalog or an external calendar), then `hooks.deriveTopic` when the editorial
 * pool is exhausted, then the built-in rotation. With no hooks this is exactly `pickTopic`.
 */
export async function resolveTopic(existing: ExistingPost[], gscQueries: GscQuery[], offset: number): Promise<SeoTopic> {
  const hooks = getBlogHooks();
  if (hooks.pickTopic) {
    const picked = await hooks.pickTopic({ existing, gscQueries, offset });
    if (picked) return picked;
  }
  if (hooks.deriveTopic && allEditorialTopicsCovered(existing)) {
    const derived: EditorialTopic = await hooks.deriveTopic({ existing });
    return { type: 'editorial', ...derived, mustBacklink: false };
  }
  return pickTopic(existing, gscQueries, offset);
}

export function describeTopic(topic: SeoTopic): string {
  const impressions = topic.impressions ? ` · ${topic.impressions} impressions` : '';
  const pinned = topic.slug ? ` · pinned slug ${topic.slug}` : '';
  return `[${topic.type}] "${topic.keyword}" (${topic.category})${impressions}${pinned} · ${BLOG_CONFIG.identity.siteHost}`;
}
