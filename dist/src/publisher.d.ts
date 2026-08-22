import type { GenerateRunOptions, GenerateRunResult } from './types.js';
export declare function countPostsSince(existing: readonly {
    date?: string;
}[], days: number, now?: Date): number;
export declare function generateBlogRun(root: string, options: GenerateRunOptions): Promise<GenerateRunResult>;
//# sourceMappingURL=publisher.d.ts.map