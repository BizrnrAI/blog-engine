/**
 * Query fan-out INTO owner pages. Instead of spawning a thin post per question, generate
 * answer passages (question + 40–60-word direct answer) for the questions a commercial owner
 * page already earns impressions on, so the owner gets more extractable, citable coverage.
 * Output is a JSON document the site renders as FAQs/answer blocks (+ FAQPage schema via
 * faqPageSchema). Claims rules and blocked phrases apply exactly as for posts.
 */
export interface FanoutPassage {
    question: string;
    answer: string;
}
export interface FanoutResult {
    ownerPath: string;
    generatedAt: string;
    sourceQueries: string[];
    passages: FanoutPassage[];
}
export declare function questionLikeQueries(queries: readonly {
    query: string;
    impressions: number;
}[], limit?: number): string[];
export declare function validateFanout(passages: FanoutPassage[], expected: number): string[];
export declare function generateFanoutPassages(ownerPath: string, options?: {
    queries?: string[];
    count?: number;
}): Promise<FanoutResult>;
//# sourceMappingURL=fanout.d.ts.map