// Typings for the Dots (always-on agent) engine, consumed by TS tests and any
// TS caller. The implementation lives in server/dots.mjs.

export interface DotFeedback {
  ts: number;
  rating: string;
  note: string;
}

export interface DotActivity {
  id: string;
  ts: number;
  kind: "note" | "report" | "error";
  text: string;
  artifactId?: string;
}

export interface DotSource {
  n: number;
  title: string;
  url: string;
}

export interface DotArtifact {
  id: string;
  ts: number;
  title: string;
  body: string;
  sources?: DotSource[];
}

export interface Dot {
  id: string;
  name: string;
  emoji: string;
  goal: string;
  instructions: string;
  autonomy: "act" | "suggest";
  cadenceMinutes: number;
  enabled: boolean;
  status: "idle" | "working" | "error";
  createdAt: number;
  updatedAt: number;
  lastRunAt: number | null;
  nextRunAt: number | null;
  runCount: number;
  provider: { baseUrl: string; apiKey?: string; temperature?: number } | null;
  model: string;
  activity: DotActivity[];
  artifacts: DotArtifact[];
  feedback: DotFeedback[];
  learnings: string[];
}

export interface DotEvent {
  kind: string;
  dotId?: string;
  name?: string;
  ts: number;
  [key: string]: unknown;
}

export interface RunResult {
  report: string;
  sources: DotSource[];
  researchedQuery: string | null;
}

export declare const DEFAULT_CADENCE_MINUTES: number;
export declare const MIN_CADENCE_MINUTES: number;
export declare const MAX_CADENCE_MINUTES: number;
export declare const MAX_ACTIVITY: number;
export declare const MAX_ARTIFACTS: number;
export declare const MAX_LEARNINGS: number;
export declare const MAX_DOTS: number;

export declare function dotId(): string;
export declare function createDotShape(input?: Partial<Dot>, now?: number): Dot;
export declare function buildDotSystemPrompt(
  dot: Dot,
  opts?: { memories?: { text: string }[]; today?: Date },
): string;
export declare function buildDotUserPrompt(dot: Dot): string;
export declare function parseDotAction(
  reply: string,
): { kind: "research"; query: string } | { kind: "report"; text: string };
export declare function selectDueDots(dots: Dot[], now?: number): Dot[];
export declare function distillLearning(rating: string, note?: string): string;
export declare function applyFeedback(
  dot: Dot,
  feedback: { rating: string; note?: string },
  now?: number,
): Dot;
export declare function publicDot(dot: Dot | null): Dot | null;
export declare function recoverStuckDots(list: Dot[], now?: number): boolean;
export declare function armDots(input: { baseUrl?: string; apiKey?: string }): Promise<{
  ok: boolean;
  count: number;
  error?: string;
}>;

export declare function onDotEvent(fn: (event: DotEvent) => void): () => void;
export declare function emitDotEvent(event: Partial<DotEvent>): void;

export declare function listDots(): Promise<Dot[]>;
export declare function getDot(id: string): Promise<Dot | null>;
export declare function createDot(input: Partial<Dot>): Promise<Dot>;
export declare function updateDot(id: string, patch: Partial<Dot>): Promise<Dot>;
export declare function deleteDot(id: string): Promise<boolean>;
export declare function chatOnce(
  provider: Dot["provider"],
  model: string,
  messages: { role: string; content: string }[],
  opts?: { temperature?: number; maxTokens?: number },
): Promise<string>;
export declare function runDot(dot: Dot, opts?: { maxSources?: number }): Promise<RunResult>;
export declare function runDotNow(id: string): Promise<{ ok: boolean; error?: string; dot?: Dot | null; artifact?: DotArtifact }>;
export declare function recordFeedback(
  id: string,
  feedback: { rating: string; note?: string },
): Promise<Dot>;
export declare function runDueDots(now?: number): Promise<unknown[]>;
export declare function startDotsScheduler(opts?: { intervalMs?: number; kickoffMs?: number }): void;
export declare function stopDotsScheduler(): void;
