import { describe, expect, it, beforeAll } from "vitest";

// Throwaway data dir — store.mjs reads this at import time.
process.env.TALIA_DATA_DIR = `/tmp/talia-dots-test-${Date.now()}`;

let dots: typeof import("../server/dots.mjs");

beforeAll(async () => {
  dots = await import("../server/dots.mjs");
});

describe("dot shape", () => {
  it("fills sane defaults", () => {
    const d = dots.createDotShape({ name: "Hunt deals", goal: "Find coupons" });
    expect(d.id).toMatch(/^dot-/);
    expect(d.name).toBe("Hunt deals");
    expect(d.goal).toBe("Find coupons");
    expect(d.enabled).toBe(true);
    expect(d.autonomy).toBe("act");
    expect(d.cadenceMinutes).toBe(dots.DEFAULT_CADENCE_MINUTES);
    expect(d.status).toBe("idle");
    expect(d.nextRunAt).not.toBeNull();
    expect(Array.isArray(d.activity)).toBe(true);
  });

  it("clamps cadence into the allowed window", () => {
    expect(dots.createDotShape({ goal: "x", cadenceMinutes: 0 }).cadenceMinutes).toBe(
      dots.MIN_CADENCE_MINUTES,
    );
    expect(dots.createDotShape({ goal: "x", cadenceMinutes: 999999 }).cadenceMinutes).toBe(
      dots.MAX_CADENCE_MINUTES,
    );
    expect(dots.createDotShape({ goal: "x", cadenceMinutes: 90 }).cadenceMinutes).toBe(90);
  });

  it("disabling a dot clears its next wake-up", () => {
    const d = dots.createDotShape({ goal: "x", enabled: false });
    expect(d.enabled).toBe(false);
    expect(d.nextRunAt).toBeNull();
  });
});

describe("dot prompts", () => {
  it("briefs the dot with its goal, instructions, learnings and memories", () => {
    const d = dots.createDotShape({
      name: "Scout",
      goal: "Track GPU prices",
      instructions: "Only reputable retailers.",
    });
    d.learnings = ["Avoid: sketchy resellers"];
    const prompt = dots.buildDotSystemPrompt(d, {
      memories: [{ text: "The user is budgeting for a 4090" }],
      today: new Date("2026-10-03T00:00:00Z"),
    });
    expect(prompt).toContain("Track GPU prices");
    expect(prompt).toContain("Only reputable retailers.");
    expect(prompt).toContain("Avoid: sketchy resellers");
    expect(prompt).toContain("budgeting for a 4090");
    expect(prompt).toContain("RESEARCH:");
    expect(prompt.toLowerCase()).toContain("never ask");
    expect(prompt).toContain("2026");
  });

  it("counts work sessions in the kick-off prompt", () => {
    const d = dots.createDotShape({ goal: "x" });
    expect(dots.buildDotUserPrompt(d)).toContain("first work session");
    d.runCount = 3;
    expect(dots.buildDotUserPrompt(d)).toContain("#4");
  });
});

describe("action parsing", () => {
  it("reads a RESEARCH request from the first line", () => {
    expect(dots.parseDotAction("RESEARCH: best budget GPU 2026")).toEqual({
      kind: "research",
      query: "best budget GPU 2026",
    });
    expect(dots.parseDotAction("ACTION: research: gpu prices").kind).toBe("research");
  });

  it("treats everything else as the report", () => {
    const r = dots.parseDotAction("## Progress\nI did a thing.");
    expect(r.kind).toBe("report");
    expect(r.kind === "report" && r.text).toContain("Progress");
    // A RESEARCH line buried later is NOT a request — only the first line counts.
    const buried = dots.parseDotAction("Progress report.\nRESEARCH: sneaky");
    expect(buried.kind).toBe("report");
  });
});

describe("scheduling", () => {
  it("selects only enabled, idle, due dots", () => {
    const now = 1_000_000;
    const due = dots.createDotShape({ goal: "a" }, now);
    due.nextRunAt = now - 1;
    const future = dots.createDotShape({ goal: "b" }, now);
    future.nextRunAt = now + 10_000;
    const disabled = dots.createDotShape({ goal: "c", enabled: false }, now);
    disabled.nextRunAt = now - 1;
    const working = dots.createDotShape({ goal: "d" }, now);
    working.nextRunAt = now - 1;
    working.status = "working";

    const picked = dots.selectDueDots([due, future, disabled, working], now);
    expect(picked.map((d) => d.goal)).toEqual(["a"]);
  });
});

describe("feedback learning", () => {
  it("distills up/down/note", () => {
    expect(dots.distillLearning("up", "concise reports")).toBe("Keep doing: concise reports");
    expect(dots.distillLearning("down", "too vague")).toBe("Avoid: too vague");
    expect(dots.distillLearning("note", "use AUD")).toBe("Note to self: use AUD");
    expect(dots.distillLearning("up", "")).toContain("right track");
  });

  it("appends a bounded learning and feedback entry", () => {
    const d = dots.createDotShape({ goal: "x" });
    dots.applyFeedback(d, { rating: "down", note: "don't email me" });
    expect(d.learnings.at(-1)).toBe("Avoid: don't email me");
    expect(d.feedback.length).toBe(1);
    for (let i = 0; i < 40; i++) dots.applyFeedback(d, { rating: "note", note: `n${i}` });
    expect(d.learnings.length).toBeLessThanOrEqual(dots.MAX_LEARNINGS);
    expect(d.feedback.length).toBeLessThanOrEqual(dots.MAX_LEARNINGS);
  });
});

describe("wire shape", () => {
  it("caps arrays and never leaks the api key", () => {
    const d = dots.createDotShape({
      goal: "x",
      provider: { baseUrl: "https://api.groq.com/openai/v1", apiKey: "secret-key" },
    });
    for (let i = 0; i < 100; i++) d.activity.push({ id: `e${i}`, ts: i, kind: "note", text: "t" });
    const pub = dots.publicDot(d)!;
    expect(pub.activity.length).toBeLessThanOrEqual(40);
    expect(pub.provider).toEqual({ baseUrl: "https://api.groq.com/openai/v1" });
    expect(JSON.stringify(pub)).not.toContain("secret-key");
  });
});

describe("dot lifecycle", () => {
  it("creates, lists, updates, learns from feedback and deletes", async () => {
    const created = await dots.createDot({ name: "Deals", emoji: "🛒", goal: "Find sales on monitors" });
    expect(created.goal).toContain("monitors");

    const listed = await dots.listDots();
    expect(listed.some((d) => d.id === created.id)).toBe(true);

    const updated = await dots.updateDot(created.id, { cadenceMinutes: 30, enabled: false });
    expect(updated.cadenceMinutes).toBe(30);
    expect(updated.enabled).toBe(false);
    expect(updated.nextRunAt).toBeNull();

    const fed = await dots.recordFeedback(created.id, { rating: "up", note: "great sources" });
    expect(fed.learnings.at(-1)).toBe("Keep doing: great sources");

    expect(await dots.deleteDot(created.id)).toBe(true);
    expect((await dots.listDots()).some((d) => d.id === created.id)).toBe(false);
  });

  it("refuses a dot with no goal", async () => {
    await expect(dots.createDot({ name: "Empty" })).rejects.toThrow(/goal/i);
  });
});

describe("stuck-run recovery", () => {
  it("resets dots left 'working' after a crash so they aren't skipped forever", () => {
    const stuck = dots.createDotShape({ goal: "a" });
    stuck.status = "working";
    const fine = dots.createDotShape({ goal: "b" });
    const changed = dots.recoverStuckDots([stuck, fine]);
    expect(changed).toBe(true);
    expect(stuck.status).toBe("idle");
    expect(fine.status).toBe("idle");
  });

  it("is a no-op when nothing is stuck", () => {
    const d = dots.createDotShape({ goal: "x" });
    expect(dots.recoverStuckDots([d])).toBe(false);
    expect(d.status).toBe("idle");
  });
});

describe("update guards", () => {
  it("rejects clearing the goal and clamps name/emoji", async () => {
    const created = await dots.createDot({ name: "Keep", goal: "stay useful" });
    await expect(dots.updateDot(created.id, { goal: "   " })).rejects.toThrow(/goal/i);

    const updated = await dots.updateDot(created.id, {
      name: "N".repeat(200),
      emoji: "🔵🔵🔵🔵🔵🔵",
    });
    expect(updated.name.length).toBe(60);
    expect(updated.emoji.length).toBeLessThanOrEqual(4);

    await dots.deleteDot(created.id);
  });
});

describe("provider key handling", () => {
  it("never persists the apiKey on the dot", async () => {
    const created = await dots.createDot({
      name: "Cloudy",
      goal: "watch the cloud",
      provider: { baseUrl: "https://api.groq.com/openai/v1", apiKey: "sk-live-secret" },
      model: "llama-3.1-8b",
    });
    const internal = await dots.getDot(created.id);
    expect(internal?.provider).toEqual({ baseUrl: "https://api.groq.com/openai/v1" });
    expect(JSON.stringify(internal?.provider ?? {})).not.toContain("sk-live-secret");
    await dots.deleteDot(created.id);
  });

  it("arms only dots that share the provider, and requires a key", async () => {
    const local = await dots.createDot({
      name: "Local",
      goal: "a",
      provider: { baseUrl: "http://localhost:11434" },
      model: "m",
    });
    const cloud = await dots.createDot({
      name: "Cloud",
      goal: "b",
      provider: { baseUrl: "https://api.groq.com/openai/v1" },
      model: "m",
    });

    const armed = await dots.armDots({ baseUrl: "https://api.groq.com/openai/v1", apiKey: "sk-2" });
    expect(armed.ok).toBe(true);
    expect(armed.count).toBe(1);

    const missing = await dots.armDots({ baseUrl: "https://api.groq.com/openai/v1" });
    expect(missing.ok).toBe(false);

    await dots.deleteDot(local.id);
    await dots.deleteDot(cloud.id);
  });
});
