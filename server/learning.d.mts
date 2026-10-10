// Typings for the self-taught learning engine, consumed by TS tests and TS
// callers. The implementation lives in server/learning.mjs.

export type LessonKind = "approach" | "correction" | "preference";
export type LessonOrigin = "chat" | "dot" | "manual" | "memory";

export interface Lesson {
  id: string;
  text: string;
  kind: LessonKind;
  origin: LessonOrigin;
  strength: number;
  createdAt: number;
  lastAt: number;
  uses: number;
  graduated: boolean;
  example: string | null;
  score?: number;
}

export interface LearningFeedback {
  ts: number;
  rating?: string;
  note?: string;
  excerpt?: string;
  origin?: string;
  sessionId?: string | null;
  distilled?: boolean;
}

export interface LearningStats {
  lastConsolidatedAt: number | null;
  distilled: number;
  graduated: number;
}

export interface LearningStatus {
  enabled: boolean;
  lessons: number;
  pendingFeedback: number;
  stats: LearningStats;
}

export const MAX_LESSONS: number;
export const MAX_FEEDBACK: number;
export const GRADUATE_STRENGTH: number;
export const STALE_DAYS: number;
export const MERGE_THRESHOLD: number;
export const REINFORCE_THRESHOLD: number;

export function lessonShape(input?: Partial<Lesson> & { text?: string }, now?: number): Lesson;
export function feedbackToLesson(feedback?: {
  rating?: string;
  note?: string;
  origin?: LessonOrigin | string;
}): Lesson | null;
export function lessonSimilarity(a: string, b: string): number;
export function mergeLessonPair(a: Lesson, b: Lesson, now?: number): Lesson;
export function applyRating(lesson: Lesson, rating: string, now?: number): { lesson: Lesson; drop: boolean };
export function effectiveStrength(lesson: Lesson, now?: number): number;
export function pruneLessons(lessons: Lesson[], now?: number): Lesson[];
export function integrateFeedback(
  lessons: Lesson[],
  feedback: Partial<LearningFeedback>,
  now?: number,
): { lessons: Lesson[]; touched: Lesson | null };
export function consolidate(input?: {
  lessons?: Lesson[];
  feedback?: Array<Partial<LearningFeedback>>;
  now?: number;
}): { lessons: Lesson[]; feedback: LearningFeedback[]; distilled: number };
export function graduates(lessons: Lesson[]): Lesson[];
export function buildLessonsPrompt(lessons: Lesson[]): string;
export function scoreLesson(lesson: Lesson, query?: string, now?: number): number;

export function recordFeedback(payload?: {
  rating?: string;
  note?: string;
  excerpt?: string;
  origin?: string;
  sessionId?: string | null;
}): Promise<{ ok: boolean; lesson: Lesson | null; lessonCount: number }>;
export function teach(text: string): Promise<Lesson>;
export function bumpUses(ids: string | string[]): Promise<void>;
export function listLessons(options?: { query?: string; limit?: number }): Promise<Lesson[]>;
export function forgetLesson(id: string): Promise<boolean>;
export function forgetAllLessons(): Promise<void>;
export function runConsolidation(now?: number): Promise<{ lessons: number; distilled: number; graduated: number }>;
export function learningStatus(): Promise<LearningStatus>;
export function startLearningScheduler(options?: { intervalMs?: number; kickoffMs?: number }): void;
export function stopLearningScheduler(): void;
