import { describe, expect, it } from "vitest";
import { buildProviderRequest, validateProviderConfig } from "../server/provider.mjs";

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
