import type { BlogSource } from './types.js';
/**
 * Verified sources (opt-in). Models invent plausible URLs; every source must (1) be on an
 * allowlisted host when the site defines one and (2) actually resolve. A dead or off-list
 * source is a validation failure fed back into the retry loop — never silently dropped.
 */
export declare function hostAllowed(url: string): boolean;
export declare function normalizeSources(raw: unknown): BlogSource[];
/** Returns the list of problems (empty = all sources verified). */
export declare function verifySources(sources: readonly BlogSource[]): Promise<string[]>;
//# sourceMappingURL=sources.d.ts.map