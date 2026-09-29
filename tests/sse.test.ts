import { describe, expect, it } from "vitest";
import { encodeSSE } from "../server/sse.mjs";

describe("encodeSSE", () => {
  it("passes through [DONE]", () => {
    expect(encodeSSE("data: [DONE]")).toBe("data: [DONE]\n\n");
  });

  it("normalizes OpenAI-style chunks into token events", () => {
    const line = 'data: {"choices":[{"delta":{"content":"Hello"}}]}';
    expect(encodeSSE(line, "llama3.2")).toBe(
      `data: ${JSON.stringify({ type: "token", token: "Hello", model: "llama3.2", finish: null })}\n\n`,
    );
  });

  it("handles completion-style chunks (choices[].text)", () => {
    const line = 'data: {"choices":[{"text":"Hi"}]}';
    expect(encodeSSE(line)).toContain('"token":"Hi"');
  });

  it("emits finish metadata when present", () => {
    const line = 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}';
    const out = encodeSSE(line);
    expect(out).toContain('"finish":"stop"');
  });

  it("skips comments, keepalives, and malformed JSON", () => {
    expect(encodeSSE(": ping")).toBe("");
    expect(encodeSSE("data: {oops")).toBe("");
    expect(encodeSSE("")).toBe("");
    expect(encodeSSE("event: ping")).toBe("");
  });
});
