export declare function rememberFact(opts: {
  text: string;
  source?: string;
  sessionId?: string | null;
}): Promise<{ id: string; text: string; merged?: boolean } | null>;

export declare function recall(
  query: string,
  opts?: { limit?: number; minScore?: number },
): Promise<{ id: string; text: string; source: string; ts: number; score: number }[]>;

export declare function listMemory(): Promise<
  { id: string; text: string; source: string; ts: number; count?: number }[]
>;

export declare function forgetFact(id: string): Promise<boolean>;
export declare function forgetAll(): Promise<void>;
export declare function snippetCandidates(text: string): string[];
