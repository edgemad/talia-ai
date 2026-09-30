import { describe, expect, it } from "vitest";
import { BUILTIN_BOTS, BUILTIN_SKILLS, getBot, getSkill } from "../server/bots.mjs";
import { SKILLS, skillById } from "../src/lib/skills";
import { PROVIDER_PRESETS, guessPreset, presetById } from "../src/lib/providers";

describe("built-in bots", () => {
  it("all have complete personas and unique ids", () => {
    const ids = new Set<string>();
    for (const b of BUILTIN_BOTS) {
      expect(b.id).toMatch(/^builtin-/);
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.emoji.length).toBeGreaterThan(0);
      expect(b.tagline.length).toBeGreaterThan(0);
      expect(b.systemPrompt.length).toBeGreaterThan(40);
      expect(b.builtin).toBe(true);
      ids.add(b.id);
    }
    expect(ids.size).toBe(BUILTIN_BOTS.length);
  });

  it("getBot finds bots by id", () => {
    expect(getBot("builtin-coder")?.name).toBe("Pixel");
    expect(getBot("nope")).toBeNull();
  });
});

describe("skills", () => {
  it("every skill builds a usable prompt", () => {
    for (const s of [...BUILTIN_SKILLS]) {
      const built = getSkill(s.id)!.build({ text: "hello", context: "chat log" });
      expect(typeof built.user).toBe("string");
      expect(built.user.length).toBeGreaterThan(0);
      if (built.system !== undefined) expect(built.system.length).toBeGreaterThan(20);
    }
  });

  it("translate targets the requested language", () => {
    const built = getSkill("translate")!.build({ text: "Japanese", context: "hello" });
    expect(built.user).toContain("Japanese");
  });

  it("review-code prefers pasted code over chat context", () => {
    const built = getSkill("review-code")!.build({ text: "const x = 1;", context: "old chat" });
    expect(built.user).toContain("const x = 1;");
    expect(built.user).not.toContain("old chat");
  });

  it("client skill list stays in sync with the server catalog", () => {
    expect(SKILLS.map((s) => s.id)).toEqual(BUILTIN_SKILLS.map((s) => s.id));
    expect(skillById("summarize")?.name).toBe("Summarize");
  });
});

describe("provider presets", () => {
  it("list free/local providers before paid ones", () => {
    const firstPaid = PROVIDER_PRESETS.findIndex((p) => !p.free);
    const lastFree = PROVIDER_PRESETS.reduce((acc, p, i) => (p.free ? i : acc), -1);
    expect(lastFree).toBeLessThan(firstPaid);
    expect(PROVIDER_PRESETS[0].free).toBe(true);
  });

  it("guesses presets from base URLs (including legacy settings)", () => {
    expect(guessPreset("http://localhost:11434")?.id).toBe("ollama");
    expect(guessPreset("http://localhost:1234/v1/")?.id).toBe("lmstudio");
    expect(guessPreset("https://api.groq.com/openai/v1")?.id).toBe("groq");
    expect(guessPreset("https://example.com/v1")).toBeNull();
  });

  it("marks cloud providers that need keys", () => {
    expect(presetById("gemini")?.needsKey).toBe(true);
    expect(presetById("ollama")?.needsKey).toBe(false);
    expect(presetById("nope")).toBeNull();
  });
});
