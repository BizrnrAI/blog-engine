export declare function hasEmDash(value: unknown): boolean;
/** Mechanical punctuation repair; never changes dates or a post's URL. */
export declare function normalizeBlogProse(text: string): string;
/** Call after custom rendering too, so an adapter cannot reintroduce forbidden punctuation. */
export declare function assertNoEmDashes(value: unknown): void;
//# sourceMappingURL=punctuation.d.ts.map