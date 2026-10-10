// 🎓 Talia's learning engine — how she teaches herself.
//
// Every 👍/👎 (from chats or dots) is a teaching moment. Talia distills
// feedback into durable **lessons**, merges each new one with what she
// already knows, injects the relevant ones into every future prompt,
// graduates her strongest lessons into long-term memory, and lets stale or
// contradicted ones fade away — on her own clock, between visits.
//
// Deliberately deterministic and rule-based: she learns even with no model
// running and no internet. Everything is local JSON (collection "learning"),
// the core is pure (unit-tested), and the whole subsystem can be disabled
// with TALIA_LEARNING_DISABLED=1.

import { readCollection, writeCollection } from "./store.mjs";
import { embed, relevance, tokenize } from "./embeddings.mjs";
import { rememberFact } from "./memory.mjs";

const COLLECTION = "learning";

export const MAX_LESSONS = 40;
export const MAX_FEEDBACK = 200;
export const MAX_EXAMPLES = 4;
/** A lesson this strong (and this fresh) graduates into long-term memory. */
export const GRADUATE_STRENGTH = 3;
/** Effective strength decays one point per this window without reinforcement. */
export const STALE_DAYS = 45;
/** Semantic similarity above which two lessons are "the same lesson". */
export const MERGE_THRESHOLD = 0.55;
/** Similarity between a feedback excerpt and an existing lesson that counts as reinforcement. */
export const REINFORCE_THRESHOLD = 0.4;

function lessonId() {
  return `lsn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function nowMs() {
  return Date.now();
}

// ---------- pure core --------------------------------------------------------

/** Normalize arbitrary input into a well-formed lesson (no persistence). */
export function lessonShape(input = {}, now = nowMs()) {
  const text = String(input.text || "").trim().slice(0, 280);
  const kind = ["approach", "correction", "preference"].includes(input.kind) ? input.kind : "preference";
  const origin = ["chat", "dot", "manual", "memory"].includes(input.origin) ? input.origin : "chat";
  return {
    id: input.id || lessonId(),
    text,
    kind,
    origin,
    strength: Math.max(0, Math.min(8, Math.round(Number(input.strength ?? 1)) || 0)),
    createdAt: input.createdAt ?? now,
    lastAt: input.lastAt ?? now,
    uses: Math.max(0, Math.round(Number(input.uses ?? 0)) || 0),
    graduated: !!input.graduated,
    example: String(input.example || "").trim().slice(0, 200) || null,
  };
}

/**
 * Turn one feedback event into a lesson candidate — or null when there is
 * nothing durable to learn (a bare rating with no words only reinforces
 * lessons the excerpt already resembles).
 */
export function feedbackToLesson({ rating, note, origin } = {}) {
  const clean = String(note || "").trim().slice(0, 280);
  if (!clean) return null;
  if (rating === "up") return lessonShape({ text: `Keep doing: ${clean}`, kind: "approach", origin, strength: 1, example: clean });
  if (rating === "down") return lessonShape({ text: `Avoid: ${clean}`, kind: "correction", origin, strength: 1, example: clean });
  return lessonShape({ text: clean, kind: "preference", origin, strength: 1, example: clean });
}

/** How similar are two lesson texts? Semantic + lexical, in [0, ~1.2]. */
export function lessonSimilarity(a, b) {
  const ta = String(a || "");
  const tb = String(b || "");
  if (!ta || !tb) return 0;
  return Math.max(relevance(ta, embed(ta), tb), relevance(tb, embed(tb), ta));
}

/** Merge two views of "the same lesson" into one stronger lesson (pure). */
export function mergeLessonPair(a, b, now = nowMs()) {
  const base = (a.strength ?? 0) >= (b.strength ?? 0) ? a : b;
  const other = base === a ? b : a;
  // Keep the OLDER lesson's id so forget-by-id stays stable across merges.
  const stableId = (a.createdAt ?? now) <= (b.createdAt ?? now) ? a.id : b.id;
  return lessonShape(
    {
      ...base,
      id: stableId,
      strength: Math.min(8, Math.max(a.strength ?? 0, b.strength ?? 0) + 1),
      createdAt: Math.min(a.createdAt ?? now, b.createdAt ?? now),
      lastAt: Math.max(a.lastAt ?? now, b.lastAt ?? now),
      uses: (a.uses ?? 0) + (b.uses ?? 0),
      example: other.example ?? base.example,
      graduated: !!(a.graduated || b.graduated),
    },
    now,
  );
}

/** Fold a rating into a lesson (pure). Returns { lesson, drop }. */
export function applyRating(lesson, rating, now = nowMs()) {
  const next = { ...lesson, lastAt: now };
  if (rating === "up") next.strength = Math.min(8, (next.strength ?? 0) + 1);
  else if (rating === "down") next.strength = (next.strength ?? 0) - 2;
  return { lesson: next, drop: next.strength < 0 };
}

/** Effective strength after time decay (pure). */
export function effectiveStrength(lesson, now = nowMs()) {
  const ageDays = Math.max(0, (now - (lesson.lastAt ?? lesson.createdAt ?? now)) / 86_400_000);
  const decaySteps = Math.floor(ageDays / STALE_DAYS);
  return (lesson.strength ?? 0) - decaySteps;
}

/** Drop unlearned/contradicted lessons, decay stale ones, cap the list (pure). */
export function pruneLessons(lessons, now = nowMs()) {
  return (lessons || [])
    .filter((l) => l && l.text && effectiveStrength(l, now) > 0)
    .sort((a, b) => effectiveStrength(b, now) - effectiveStrength(a, now) || (b.lastAt ?? 0) - (a.lastAt ?? 0))
    .slice(0, MAX_LESSONS);
}

const NEGATION_RE = /\b(no|not|never|dont|don't|stop|quit|without|fewer|less|instead|rather)\b/i;

/**
 * Does a correction note contradict an existing "keep doing" lesson? A
 * negated note that shares a content word with the approach ("no emoji at
 * all" vs "use plenty of emoji") is a reversal of advice, not a new topic.
 */
function contradicts(correctionText, approachText) {
  const strip = (t) => String(t || "").toLowerCase().replace(/^(keep doing|avoid|note to self)\s*[:\-]?\s*/, "");
  const raw = strip(correctionText);
  if (!NEGATION_RE.test(raw)) return false; // not a reversal → just another topic
  const ct = tokenize(raw);
  const at = tokenize(strip(approachText));
  return ct.some((t) => at.includes(t) && t.length > 3);
}

/**
 * Integrate one feedback event into a lesson list (pure).
 * Returns { lessons, touched } — touched is the lesson that absorbed it.
 */
export function integrateFeedback(lessons, feedback, now = nowMs()) {
  const list = [...(lessons || [])];
  const candidate = feedbackToLesson(feedback);
  let touched = null;

  // 1) A spoken note: merge into the most similar existing lesson, or grow a new one.
  if (candidate) {
    let best = null;
    let bestScore = 0;
    for (const l of list) {
      const s = lessonSimilarity(l.text, candidate.text);
      if (s > bestScore) {
        best = l;
        bestScore = s;
      }
    }
    if (best && bestScore >= MERGE_THRESHOLD) {
      const merged = mergeLessonPair(best, candidate, now);
      touched = merged;
      Object.assign(best, merged);
      // A correction that contradicts a previously "keep doing" lesson must
      // not silently strengthen it — apply the rating instead.
      if (best.kind === "approach" && candidate.kind === "correction") {
        const r = applyRating(best, "down", now);
        if (r.drop) {
          list.splice(list.indexOf(best), 1);
          touched = null;
        } else {
          Object.assign(best, r.lesson);
          touched = best;
        }
      }
    } else {
      touched = candidate;
      list.push(candidate);
    }

    // A negated correction can reverse earlier advice: downgrade any approach
    // lesson it contradicts, so the prompt never carries both sides at once.
    if (candidate.kind === "correction") {
      for (const l of [...list]) {
        if (touched && l.id === touched.id) continue;
        if (l.kind === "approach" && contradicts(candidate.text, l.text)) {
          const r = applyRating(l, "down", now);
          if (r.drop) list.splice(list.indexOf(l), 1);
          else Object.assign(l, r.lesson);
        }
      }
    }
  }

  // 2) A bare rating still teaches: reinforce existing lessons the exchange resembles.
  if (feedback.rating === "up" && String(feedback.excerpt || "").trim()) {
    for (const l of list) {
      if (touched && l.id === touched.id) continue;
      if (relevance(feedback.excerpt, embed(feedback.excerpt), l.text) >= REINFORCE_THRESHOLD) {
        const r = applyRating(l, "up", now);
        if (r.drop) list.splice(list.indexOf(l), 1);
        else Object.assign(l, r.lesson);
      }
    }
  }

  return { lessons: list, touched };
}

/**
 * The full consolidation pass (pure): distill every not-yet-distilled
 * feedback event, then prune. Returns { lessons, feedback, distilled }.
 */
export function consolidate({ lessons = [], feedback = [], now = nowMs() }) {
  let list = lessons.map((l) => lessonShape(l, now));
  const events = feedback.map((f) => ({ ...f }));
  let distilled = 0;

  for (const f of events) {
    if (f.distilled) continue;
    // Corrections and notes always teach; a bare 👍 only reinforces.
    const { lessons: next, touched } = integrateFeedback(list, {
      rating: f.rating,
      note: f.note,
      excerpt: f.excerpt,
      origin: f.origin,
    }, now);
    list = next;
    f.distilled = true;
    if (touched) distilled += 1;
  }

  list = pruneLessons(list, now);
  return { lessons: list, feedback: events.slice(-MAX_FEEDBACK), distilled };
}

/** Lessons strong enough and fresh enough to become permanent memory (pure). */
export function graduates(lessons) {
  return (lessons || []).filter((l) => l && !l.graduated && l.strength >= GRADUATE_STRENGTH);
}

/** The system-prompt block for a set of lessons (pure). "" when empty. */
export function buildLessonsPrompt(lessons) {
  const list = (lessons || []).filter((l) => l?.text).slice(0, 6);
  if (list.length === 0) return "";
  return (
    "Lessons you've learned from the user's feedback (respect these silently — never quote this list back):\n" +
    list.map((l) => `- ${l.text}`).join("\n")
  );
}

/** Rank lessons for a query: relevance × strength × recency (pure). */
export function scoreLesson(lesson, query, now = nowMs()) {
  const sem = query ? relevance(query, embed(query), lesson.text) : 0.2;
  const strength = Math.max(0, effectiveStrength(lesson, now)) / 8;
  const ageDays = Math.max(0, (now - (lesson.lastAt ?? now)) / 86_400_000);
  const recency = Math.pow(0.5, ageDays / 60);
  return 0.55 * sem + 0.3 * strength + 0.15 * recency;
}

// ---------- durable store ------------------------------------------------------

let state = null;

async function load() {
  if (state) return state;
  const raw = await readCollection(COLLECTION, {});
  state = {
    lessons: Array.isArray(raw?.lessons) ? raw.lessons : [],
    feedback: Array.isArray(raw?.feedback) ? raw.feedback : [],
    stats: {
      lastConsolidatedAt: raw?.stats?.lastConsolidatedAt ?? null,
      distilled: raw?.stats?.distilled ?? 0,
      graduated: raw?.stats?.graduated ?? 0,
    },
  };
  return state;
}

function persist() {
  writeCollection(COLLECTION, state);
}

/**
 * Record a teaching moment. A spoken note becomes (or strengthens) a lesson
 * immediately — the user should see Talia learn in real time — and the event
 * is kept for the next consolidation pass too.
 */
export async function recordFeedback({ rating, note, excerpt, origin = "chat", sessionId } = {}) {
  const s = await load();
  const event = {
    ts: nowMs(),
    rating: rating === "up" || rating === "down" ? rating : "note",
    note: String(note || "").trim().slice(0, 280),
    excerpt: String(excerpt || "").trim().slice(0, 600),
    origin,
    sessionId: sessionId || null,
    distilled: false,
  };
  s.feedback = [...s.feedback, event].slice(-MAX_FEEDBACK);

  const { lessons, touched } = integrateFeedback(s.lessons, event);
  s.lessons = pruneLessons(lessons);
  event.distilled = true;
  if (touched) s.stats.distilled += 1;
  persist();
  return { ok: true, lesson: touched ? s.lessons.find((l) => l.id === touched.id) ?? touched : null, lessonCount: s.lessons.length };
}

/** Manually teach a lesson (from the Memory panel). Strong start: strength 2. */
export async function teach(text) {
  const clean = String(text || "").trim().slice(0, 280);
  if (!clean) throw new Error("A lesson needs some words.");
  const s = await load();
  const candidate = lessonShape({ text: clean, kind: "preference", origin: "manual", strength: 2 });
  let touched = null;
  for (const l of s.lessons) {
    if (lessonSimilarity(l.text, candidate.text) >= MERGE_THRESHOLD) {
      touched = mergeLessonPair(l, candidate);
      Object.assign(l, touched);
      break;
    }
  }
  if (!touched) {
    s.lessons = pruneLessons([...s.lessons, candidate]);
    touched = s.lessons.find((l) => l.id === candidate.id) ?? candidate;
  }
  persist();
  return touched;
}

/**
 * Count a real injection: a lesson that made it into a prompt. Keeps `uses`
 * honest so scoring can favour advice that has actually earned its place.
 */
export async function bumpUses(ids) {
  const wanted = new Set((Array.isArray(ids) ? ids : [ids]).map(String));
  if (wanted.size === 0) return;
  const s = await load();
  let changed = false;
  for (const l of s.lessons) {
    if (wanted.has(String(l.id))) {
      l.uses = (l.uses ?? 0) + 1;
      changed = true;
    }
  }
  if (changed) persist();
}

/** List lessons, best match for the query first. */
export async function listLessons({ query, limit = MAX_LESSONS } = {}) {
  const s = await load();
  const now = nowMs();
  return pruneLessons(s.lessons, now)
    .map((l) => ({ ...l, score: Number(scoreLesson(l, query || "", now).toFixed(3)) }))
    .sort((a, b) => (query ? b.score - a.score : b.lastAt - a.lastAt))
    .slice(0, Math.max(1, Math.min(MAX_LESSONS, Number(limit) || MAX_LESSONS)));
}

export async function forgetLesson(id) {
  const s = await load();
  const before = s.lessons.length;
  s.lessons = s.lessons.filter((l) => l.id !== id);
  persist();
  return s.lessons.length < before;
}

export async function forgetAllLessons() {
  const s = await load();
  s.lessons = [];
  s.feedback = [];
  s.stats = { lastConsolidatedAt: null, distilled: 0, graduated: 0 };
  persist();
}

/**
 * Consolidate on the server's own clock: distill backlog, graduate strong
 * lessons into long-term memory, persist. Returns a small summary.
 */
export async function runConsolidation(now = nowMs()) {
  const s = await load();
  const { lessons, feedback, distilled } = consolidate({ lessons: s.lessons, feedback: s.feedback, now });
  s.lessons = lessons;
  s.feedback = feedback;

  // Graduate: the best lessons become durable cross-chat memory too, so they
  // survive even if the learning store is cleared.
  const fresh = graduates(s.lessons);
  let graduated = 0;
  for (const l of fresh) {
    try {
      await rememberFact({ text: `Lesson learned: ${l.text}`, source: "learning" });
      l.graduated = true;
      graduated += 1;
    } catch {
      /* memory is best-effort — retry next pass */
    }
  }
  s.stats.lastConsolidatedAt = now;
  s.stats.distilled += distilled;
  s.stats.graduated += graduated;
  persist();
  return { lessons: s.lessons.length, distilled, graduated };
}

/** One-line status for the UI. */
export async function learningStatus() {
  const s = await load();
  const lessons = pruneLessons(s.lessons);
  return {
    enabled: process.env.TALIA_LEARNING_DISABLED !== "1",
    lessons: lessons.length,
    pendingFeedback: s.feedback.filter((f) => !f.distilled).length,
    stats: s.stats,
  };
}

// ---------- scheduler -----------------------------------------------------------

let timer = null;
let kickoff = null;

/** Consolidate shortly after boot, then keep a light daily rhythm. */
export function startLearningScheduler({ intervalMs = 6 * 60 * 60 * 1000, kickoffMs = 90_000 } = {}) {
  if (process.env.TALIA_LEARNING_DISABLED === "1") return;
  if (timer) return;
  kickoff = setTimeout(() => {
    void runConsolidation().catch(() => {});
  }, kickoffMs);
  kickoff.unref?.();
  timer = setInterval(() => {
    void runConsolidation().catch(() => {});
  }, intervalMs);
  timer.unref?.();
}

export function stopLearningScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (kickoff) {
    clearTimeout(kickoff);
    kickoff = null;
  }
}
