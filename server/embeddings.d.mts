export declare function embed(text: string): number[];
export declare function cosine(a: number[], b: number[]): number;
export declare function tokenize(text: string): string[];
export declare function keywordScore(queryTokens: string[], docTokens: string[]): number;
export declare function relevance(queryText: string, queryVec: number[], doc: string): number;
