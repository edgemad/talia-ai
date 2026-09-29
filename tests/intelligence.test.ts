import { describe, expect, it, beforeAll } from "vitest";

// Use a throwaway data dir for the memory tests (read by store.mjs at import)
process.env.TALIA_DATA_DIR = `/tmp/talia-test-${Date.now()}`;

let memory: typeof import("../server/memory.mjs");
let embeddings: typeof import("../server/embeddings.mjs");
let research: typeof import("../server/research.mjs");

beforeAll(async () => {
  memory = await import("../server/memory.mjs");
  embeddings = await import("../server/embeddings.mjs");
  research = await import("../server/research.mjs");
});

describe("embeddings", () => {
  it("is deterministic and normalized", () => {
    const a = embeddings.embed("cozy pastel cats");
    const b = embeddings.embed("cozy pastel cats");
    expect(a).toEqual(b);
    const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("scores identical text 1.0 and unrelated text lower", () => {
    const a = embeddings.embed("the user loves strawberry cake");
    const same = embeddings.cosine(a, embeddings.embed("the user loves strawberry cake"));
    const other = embeddings.cosine(a, embeddings.embed("quantum flux capacitor repair manual"));
    expect(same).toBeCloseTo(1, 4);
    expect(other).toBeLessThan(same);
  });

  it("blends lexical matches into relevance", () => {
    const qv = embeddings.embed("favorite programming language");
    const hit = embeddings.relevance("favorite programming language", qv, "Her favorite programming language is Rust");
    const miss = embeddings.relevance("favorite programming language", qv, "Grocery list: oats, milk, honey");
    expect(hit).toBeGreaterThan(miss);
  });
});

describe("memory", () => {
  it("remembers, dedupes, recalls and forgets", async () => {
    const first = await memory.rememberFact({ text: "The user's favorite color is blush pink.", source: "test" });
    expect(first).not.toBeNull();

    const dupe = await memory.rememberFact({ text: "The user's favorite color is blush pink!", source: "test" });
    expect(dupe?.merged).toBe(true);

    await memory.rememberFact({ text: "Project Phoenix uses PostgreSQL 16 with pgvector.", source: "test" });

    const hits = await memory.recall("What's my favorite color?", { limit: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text).toContain("blush pink");

    const all = await memory.listMemory();
    expect(all.length).toBe(2);

    const gone = await memory.forgetFact((first as { id: string }).id);
    expect(gone).toBe(true);
    expect((await memory.listMemory()).length).toBe(1);
  });

  it("snippetCandidates splits prose into sentence-sized memories", () => {
    const parts = memory.snippetCandidates(
      "I finished the design review today! The client wants pastel gradients everywhere. Short. This last sentence is long enough to be remembered by Talia because it exceeds the minimum length threshold clearly.",
    );
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.every((p: string) => p.length >= 25)).toBe(true);
  });
});

describe("research extraction", () => {
  it("strips scripts, styles and tags", () => {
    const html = `<html><head><title>Cozy &amp; Cute</title><style>p{}</style></head><body><script>bad()</script><h1>Hello</h1><p>World</p></body></html>`;
    expect(research.extractTitle(html)).toBe("Cozy & Cute");
    const text = research.stripHtml(html);
    expect(text).toContain("Hello");
    expect(text).not.toContain("bad()");
    expect(text).not.toContain("<h1>");
  });

  it("extracts readable chunks from page text", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} talks about cozy pastel software with plenty of useful detail for the reader to enjoy and learn from thoroughly.`).join(" ");
    const chunks = research.readableChunks(`<html><body>${long}</body></html>`);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c: string) => !c.includes("<html>"))).toBe(true);
  });

  it("extractiveAnswer picks query-relevant sentences with citations", () => {
    const sources = [
      { n: 1, title: "A", url: "https://a.example", text: "Talia is a cozy local assistant. The weather in Tokyo is mild today." },
      { n: 2, title: "B", url: "https://b.example", snippet: "Talia runs fully offline and keeps chats private on your machine." },
    ];
    const ans = research.extractiveAnswer("is talia cozy and local?", sources);
    expect(ans).toContain("[1]");
    expect(ans.toLowerCase()).toContain("cozy");
  });
});
