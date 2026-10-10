import { describe, expect, it } from "vitest";
import { buildProviderRequest, validateProviderConfig, classifyUpstreamError } from "../server/provider.mjs";

describe("buildProviderRequest", () => {
  it("appends /v1/chat/completions to plain Ollama URLs", () => {
    const req = buildProviderRequest(
      { baseUrl: "http://localhost:11434", temperature: 0.7 },
      [{ role: "user", content: "hi" }],
      "llama3.2",
    );
    expect(req.url).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("does not double the /v1 suffix", () => {
    const req = buildProviderRequest(
      { baseUrl: "http://localhost:1234/v1", temperature: 0.7 },
      [{ role: "user", content: "hi" }],
      "mistral",
    );
    expect(req.url).toBe("http://localhost:1234/v1/chat/completions");
  });

  it("strips trailing slashes", () => {
    const req = buildProviderRequest(
      { baseUrl: "http://localhost:8080/", temperature: 0.7 },
      [{ role: "user", content: "hi" }],
      "gpt-4o-mini",
    );
    expect(req.url).toBe("http://localhost:8080/v1/chat/completions");
  });

  it("sets bearer auth when an API key is present", () => {
    const req = buildProviderRequest(
      { baseUrl: "http://x", apiKey: "sk-abc", temperature: 0.7 },
      [],
      "m",
    );
    expect(req.headers.get("Authorization")).toBe("Bearer sk-abc");
  });

  it("serializes temperature and max_tokens", async () => {
    const req = buildProviderRequest(
      { baseUrl: "http://x", temperature: 0.2, maxTokens: 512 },
      [{ role: "user", content: "hi" }],
      "m",
    );
    const body = await (req as unknown as Request).json();
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(512);
    expect(body.stream).toBe(true);
  });
});

describe("validateProviderConfig", () => {
  it("accepts http(s) URLs", () => {
    expect(validateProviderConfig({ baseUrl: "http://localhost:11434" })).toBe(true);
    expect(validateProviderConfig({ baseUrl: "https://ai.local/v1" })).toBe(true);
  });

  it("rejects junk", () => {
    expect(validateProviderConfig(null)).toBe(false);
    expect(validateProviderConfig({ baseUrl: "not a url" })).toBe(false);
    expect(validateProviderConfig({ baseUrl: "ftp://x" })).toBe(false);
  });
});

describe("classifyUpstreamError", () => {
  const ollamaMissing = JSON.stringify({
    error: { message: 'model "dolphin-mistral:7b" not found, try pulling it first', type: "not_found_error" },
  });

  it("recognises Ollama's missing-model 404 and names the model", () => {
    const r = classifyUpstreamError(404, ollamaMissing, "ignored-when-quoted");
    expect(r.code).toBe("model_not_found");
    expect(r.model).toBe("dolphin-mistral:7b");
    expect(r.message).toContain("dolphin-mistral:7b");
    expect(r.message).toContain("Pull");
  });

  it("falls back to the requested model when the body doesn't name one", () => {
    const r = classifyUpstreamError(404, '{"error":{"message":"model not found"}}', "qwen2.5:3b");
    expect(r.code).toBe("model_not_found");
    expect(r.model).toBe("qwen2.5:3b");
  });

  it("handles LM Studio-style 404s", () => {
    const r = classifyUpstreamError(404, '{"error":{"message":"Model not found"}}', "phi3:mini");
    expect(r.code).toBe("model_not_found");
    expect(r.model).toBe("phi3:mini");
  });

  it("leaves auth and server errors as generic provider errors", () => {
    const auth = classifyUpstreamError(401, '{"error":{"message":"invalid api key"}}', "gpt-4o");
    expect(auth.code).toBe("provider_error");
    expect(auth.model).toBeNull();
    expect(auth.message).toContain("401");

    // 404 that clearly isn't about a model (unknown endpoint) stays generic.
    const notFound = classifyUpstreamError(404, '{"error":{"message":"no such route"}}', "x");
    expect(notFound.code).toBe("provider_error");

    const server = classifyUpstreamError(500, "boom", "x");
    expect(server.code).toBe("provider_error");
    expect(server.message).toContain("500");
  });

  it("never lets a huge body bloat the message", () => {
    const r = classifyUpstreamError(500, "x".repeat(5000), "x");
    expect(r.message.length).toBeLessThan(500);
  });
});
