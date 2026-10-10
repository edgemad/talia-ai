import { describe, expect, it, beforeAll } from "vitest";

// Throwaway data dir — store.mjs reads this at import time.
process.env.TALIA_DATA_DIR = `/tmp/talia-learning-test-${Date.now()}`;

let learning: typeof import("../server/learning.mjs");

beforeAll(async () => {
  learning = await import("../server/learning.mjs");
});

const DAY = 86_400_000;

describe("lesson shape", () => {
  it("fills sane defaults and bounds", () => {
    const l = learning.lessonShape({ text: "  Keep answers short.  " });
    expect(l.id).toMatch(/^lsn-/);
    expect(l.text).toBe("Keep answers short.");
    expect(l.kind).toBe("preference");
    expect(l.origin).toBe("chat");
    expect(l.strength).toBe(1);
    expect(l.graduated).toBe(false);
    expect(l.lastAt).toBeTypeOf("number");
  });

  it("clamps strength into [0, 8] and slices long text", () => {
    expect(learning.lessonShape({ text: "x", strength: 99 }).strength).toBe(8);
    expect(learning.lessonShape({ text: "x", strength: -5 }).strength).toBe(0);
    expect(learning.lessonShape({ text: "y".repeat(500) }).text.length).toBeLessThanOrEqual(280);
  });
});

describe("feedback → lesson", () => {
  it("turns a 👍 note into an approach lesson", () => {
    const l = learning.feedbackToLesson({ rating: "up", note: "short code examples", origin: "chat" });
    expect(l?.text).toBe("Keep doing: short code examples");
    expect(l?.kind).toBe("approach");
  });

  it("turns a 👎 note into a correction lesson", () => {
    const l = learning.feedbackToLesson({ rating: "down", note: "don't use emoji", origin: "dot" });
    expect(l?.text).toBe("Avoid: don't use emoji");
    expect(l?.kind).toBe("correction");
    expect(l?.origin).toBe("dot");
  });

  it("keeps a bare note as a preference and drops empty feedback", () => {
    expect(learning.feedbackToLesson({ rating: "note", note: "prefers British English" })?.kind).toBe("preference");
    expect(learning.feedbackToLesson({ rating: "up", note: "   " })).toBeNull();
    expect(learning.feedbackToLesson({ rating: "up" })).toBeNull();
  });
});

describe("merging & ratings", () => {
  it("merges similar lessons into the stronger one, keeping the older id", () => {
    const now = Date.now();
    const a = learning.lessonShape({ id: "lsn-old", text: "Keep doing: short answers", strength: 1, createdAt: now - DAY });
    const b = learning.lessonShape({ text: "Keep doing: short answers please", strength: 3 });
    const m = learning.mergeLessonPair(a, b, now);
    expect(m.id).toBe("lsn-old");
    expect(m.strength).toBe(4); // max(1,3)+1
    expect(m.createdAt).toBe(now - DAY);
  });

  it("recognises similar lessons as the same idea", () => {
    expect(learning.lessonSimilarity("Keep answers short and simple", "Keep answers short and simple please")).toBeGreaterThan(0.55);
    expect(learning.lessonSimilarity("Keep answers short", "Always write long academic essays")).toBeLessThan(0.55);
  });

  it("drops a lesson once sustained 👎 outweighs its strength", () => {
    const now = Date.now();
    const l = learning.lessonShape({ text: "Avoid: emoji", strength: 3 });
    const r1 = learning.applyRating(l, "down", now);
    expect(r1.drop).toBe(false);
    expect(r1.lesson.strength).toBe(1);
    const r2 = learning.applyRating(r1.lesson, "down", now);
    expect(r2.drop).toBe(true); // strength fell below zero — unlearned
    // A fresh (strength 1) lesson dies to a single 👎 — responsiveness first.
    expect(learning.applyRating(learning.lessonShape({ text: "weak", strength: 1 }), "down", now).drop).toBe(true);
  });
});

describe("decay & pruning", () => {
  it("decays effective strength over time and prunes dead lessons", () => {
    const now = Date.now();
    const fresh = learning.lessonShape({ text: "Keep: fresh", strength: 1, lastAt: now });
    const stale = learning.lessonShape({ text: "Keep: stale", strength: 1, lastAt: now - 100 * DAY });
    const strong = learning.lessonShape({ text: "Keep: strong", strength: 5, lastAt: now - 100 * DAY });
    expect(learning.effectiveStrength(fresh, now)).toBe(1);
    expect(learning.effectiveStrength(stale, now)).toBeLessThan(1);
    const pruned = learning.pruneLessons([fresh, stale, strong], now);
    expect(pruned.map((l: { text: string }) => l.text)).toContain("Keep: fresh");
    expect(pruned.map((l: { text: string }) => l.text)).toContain("Keep: strong");
    expect(pruned.map((l: { text: string }) => l.text)).not.toContain("Keep: stale");
  });
});

describe("consolidation", () => {
  it("distills backlog feedback once, merges repeats, never exceeding the cap", () => {
    const now = Date.now();
    const feedback = [
      { ts: now, rating: "up", note: "wants bullet points", distilled: false },
      { ts: now, rating: "up", note: "wants bullet point answers", distilled: false },
      { ts: now, rating: "down", note: "no long preambles", distilled: false },
      { ts: now, rating: "up", note: "", excerpt: "", distilled: false },
    ];
    const out = learning.consolidate({ lessons: [], feedback, now });
    expect(out.distilled).toBe(3); // the bare 👍 has nothing to teach
    expect(out.feedback.every((f) => f.distilled)).toBe(true);
    // two similar 👍 notes become ONE lesson, strengthened
    const bullets = out.lessons.filter((l: { text: string }) => l.text.includes("bullet"));
    expect(bullets).toHaveLength(1);
    expect(bullets[0].strength).toBeGreaterThanOrEqual(2);
    expect(out.lessons.some((l: { text: string }) => l.text === "Avoid: no long preambles")).toBe(true);

    // Running again changes nothing (idempotent).
    const again = learning.consolidate({ lessons: out.lessons, feedback: out.feedback, now });
    expect(again.distilled).toBe(0);
    expect(again.lessons).toHaveLength(out.lessons.length);
  });

  it("lets a correction overrule a previously loved approach", () => {
    const now = Date.now();
    let { lessons } = learning.consolidate({
      lessons: [],
      feedback: [{ ts: now, rating: "up", note: "use plenty of emoji", distilled: false }],
      now,
    });
    expect(lessons[0].kind).toBe("approach");
    ({ lessons } = learning.consolidate({
      lessons,
      feedback: [{ ts: now, rating: "down", note: "actually, no emoji at all", distilled: false }],
      now,
    }));
    const emoji = lessons.find((l: { text: string }) => l.text.toLowerCase().includes("emoji"));
    // The old "keep doing emoji" lesson must not survive as advice.
    expect(emoji?.text ?? "").not.toMatch(/^Keep doing/);
  });

  it("a bare 👍 reinforces lessons the exchange resembles", () => {
    const now = Date.now();
    const seeded = [learning.lessonShape({ text: "Keep doing: answer in French", strength: 1, lastAt: now })];
    const { lessons } = learning.consolidate({
      lessons: seeded,
      feedback: [{ ts: now, rating: "up", note: "", excerpt: "Could you answer this one in French please?", distilled: false }],
      now,
    });
    expect(lessons[0].strength).toBe(2);
  });
});

describe("graduation & prompt", () => {
  it("graduates only strong, ungraduated lessons", () => {
    const weak = learning.lessonShape({ text: "weak", strength: 2 });
    const strong = learning.lessonShape({ text: "strong", strength: 3 });
    const done = learning.lessonShape({ text: "done", strength: 5, graduated: true });
    expect(learning.graduates([weak, strong, done]).map((l: { text: string }) => l.text)).toEqual(["strong"]);
  });

  it("builds a prompt block, or nothing when empty", () => {
    expect(learning.buildLessonsPrompt([])).toBe("");
    const block = learning.buildLessonsPrompt([learning.lessonShape({ text: "Keep it short" })]);
    expect(block).toContain("Lessons you've learned");
    expect(block).toContain("Keep it short");
  });
});

describe("store round-trip (integration)", () => {
  it("records feedback, teaches, lists, forgets — and consolidation graduates to memory", async () => {
    const r = await learning.recordFeedback({ rating: "up", note: "prefers TypeScript examples", excerpt: "Show me a JS function" });
    expect(r.ok).toBe(true);
    expect(r.lesson?.text).toBe("Keep doing: prefers TypeScript examples");

    const taught = await learning.teach("Always show the final result first");
    expect(taught.origin).toBe("manual");
    expect(taught.strength).toBe(2);

    const list = await learning.listLessons({});
    expect(list.length).toBeGreaterThanOrEqual(2);

    const hits = await learning.listLessons({ query: "TypeScript code examples" });
    expect(hits[0].text).toContain("TypeScript");

    // Boost one lesson past the graduation bar, then consolidate.
    for (let i = 0; i < 3; i++) {
      await learning.recordFeedback({ rating: "up", note: "prefers TypeScript examples" });
    }
    const summary = await learning.runConsolidation();
    expect(summary.graduated).toBeGreaterThanOrEqual(1);
    expect(summary.lessons).toBeGreaterThanOrEqual(1);

    const target = (await learning.listLessons({})).find((l: { text: string }) => l.text.includes("TypeScript"));
    expect(await learning.forgetLesson(target!.id)).toBe(true);

    const status = await learning.learningStatus();
    expect(status.enabled).toBe(true);
    expect(status.stats.graduated).toBeGreaterThanOrEqual(1);
  });

  it("counts real injections via bumpUses and ignores unknown ids", async () => {
    const taught = await learning.teach("Always ship a changelog with a release");
    expect(taught.uses).toBe(0);

    await learning.bumpUses([taught.id]);
    await learning.bumpUses(taught.id); // single id form
    await learning.bumpUses(["does-not-exist"]); // no throw, no effect

    const list = await learning.listLessons({});
    const found = list.find((l: { id: string }) => l.id === taught.id);
    expect(found?.uses).toBe(2);
  });
});
