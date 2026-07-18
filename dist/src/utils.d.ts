export declare function norm(s: string): string;
export declare function slugify(s: string): string;
export declare function wordCount(s: string): number;
export declare function yamlString(s: string): string;
export declare function xmlEscape(s: string): string;
/**
 * Deterministically shorten text to maxChars on a word boundary. Models cannot
 * count characters, so length limits are enforced here rather than by
 * rejecting a generation attempt.
 */
export declare function clampText(s: string, maxChars: number): string;
export declare function mimeTypeFor(path: string): string;
export declare function env(name: string, required?: boolean): string;
//# sourceMappingURL=utils.d.ts.map