/**
 * Frontmatter key aliases.
 *
 * The engine's own `toMarkdown` writes `date/updated/image/imageAlt/...`, but a site that owns its
 * frontmatter shape through `hooks.renderMarkdown` (or that predates the engine) commonly uses
 * `pubDate/updatedDate/cover/coverAlt/readingTime`. Without a translation those posts look
 * date-less and image-less to the cadence guard, the corpus audit, the scorecard and refresh mode.
 *
 * Normalization is ADDITIVE and canonical-first: an alias only fills a canonical key that is not
 * already present, and every original key is preserved, so existing adapters (and any code reading
 * `frontmatter.pubDate` directly) behave exactly as before.
 */
export declare const DEFAULT_FRONTMATTER_ALIASES: Readonly<Record<string, string>>;
/**
 * Canonical values the engine expects as numbers/dates, coerced from the shapes sites really use:
 * `readingTime: "7 min"` → `readMins: "7"`, `pubDate: 2026-07-01T12:00:00-07:00` → `date: 2026-07-01`.
 * Anything unrecognized passes through untouched — a coercion never invents data.
 */
export declare function coerceFrontmatterValue(canonicalKey: string, value: string): string;
/** Site-configured aliases merged over the defaults; falls back to the defaults with no runtime. */
export declare function resolveFrontmatterAliases(): Readonly<Record<string, string>>;
export declare function normalizeFrontmatter(frontmatter: Record<string, string>, aliases?: Readonly<Record<string, string>>): Record<string, string>;
//# sourceMappingURL=frontmatter.d.ts.map