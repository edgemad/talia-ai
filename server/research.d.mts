export interface ResearchSourceLike {
  n: number;
  title: string;
  url: string;
  snippet?: string;
  text?: string;
}

export declare function stripHtml(html: string): string;
export declare function extractTitle(html: string): string;
export declare function readableChunks(html: string, maxChars?: number): string[];
export declare function searchDuckDuckGo(
  query: string,
  count?: number,
): Promise<{ title: string; url: string; snippet: string }[]>;
export declare function webSearch(
  query: string,
  count?: number,
): Promise<{ results: { title: string; url: string; snippet: string }[]; engine: string }>;
export declare function readPage(
  url: string,
  maxChars?: number,
): Promise<{ title: string; text: string }>;
export declare function research(
  query: string,
  opts?: { maxSources?: number; onProgress?: (msg: string) => void },
): Promise<{
  engine: string;
  sources: ResearchSourceLike[];
  digest: string;
  context: string;
}>;
export declare function extractiveAnswer(query: string, sources: ResearchSourceLike[]): string;
