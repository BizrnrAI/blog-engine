/**
 * Second demand signal. The ASEO skill requires two independent demand sources before a new
 * URL is created; Search Console is the first. The default second source is public search
 * autocomplete (DuckDuckGo's suggestion endpoint — no key, no tracking), replaceable by the
 * fetchDemandSignals hook (People-Also-Ask, site search, support logs...). Network failure is
 * "no signal", never a crash.
 */
export declare function duckDuckGoSuggestions(query: string, timeoutMs?: number): Promise<string[]>;
/** True when a suggestion shares most distinctive words with the query (independent corroboration). */
export declare function corroborates(query: string, suggestions: readonly string[]): boolean;
export declare function hasSecondDemandSignal(query: string): Promise<boolean>;
//# sourceMappingURL=demand.d.ts.map