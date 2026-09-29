import { describe, expect, it } from "vitest";
import { exportAsJson, exportAsMarkdown } from "../src/lib/exportChat";
import { loadSettings } from "../src/lib/storage";
import type { ChatMessage } from "../src/types";

function msg(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: Math.random().toString(36).slice(2), role, content, createdAt: Date.now() };
}

describe("chat export", () => {
  it("renders markdown with roles and timestamps", () => {
    const md = exportAsMarkdown([msg("user", "Hi Talia!"), msg("assistant", "Hiiii! ✨")]);
    expect(md).toContain("# Talia AI");
    expect(md).toContain("## 🧑 You");
    expect(md).toContain("## 🌸 Talia");
    expect(md).toContain("Hi Talia!");
    expect(md).toContain("Hiiii! ✨");
  });

  it("includes the model name when present", () => {
    const m = { ...msg("assistant", "hi"), model: "llama3.2" };
    expect(exportAsMarkdown([m])).toContain("(llama3.2)");
  });

  it("exports valid JSON with messages array", () => {
    const parsed = JSON.parse(exportAsJson([msg("user", "test")]));
    expect(parsed.app).toBe("talia-ai");
    expect(Array.isArray(parsed.messages)).toBe(true);
  });
});

describe("storage", () => {
  it("falls back to defaults when localStorage is unavailable", () => {
    const s = loadSettings();
    expect(s.provider.temperature).toBe(0.7);
    expect(s.customModels).toEqual([]);
  });
});
