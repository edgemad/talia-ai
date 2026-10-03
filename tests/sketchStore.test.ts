import { describe, expect, it } from "vitest";
import {
  MAX_SKETCHES,
  deleteSketch,
  loadSketches,
  newSketchId,
  parseSketches,
  saveSketch,
  type Sketch,
  type Store,
} from "../src/lib/sketchStore";

/**
 * A fake Storage. `budgetBytes` models a browser quota; `writesAllowed` models
 * a browser that lets the first write through and then refuses, which is the
 * only way to prove the "even trimming cannot save it" branch.
 */
function fakeStore(opts: { budgetBytes?: number; writesAllowed?: number } = {}): Store & { written: number } {
  const { budgetBytes = Infinity, writesAllowed = Infinity } = opts;
  const map = new Map<string, string>();
  const self = {
    written: 0,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > budgetBytes || self.written >= writesAllowed) {
        const err = new Error("QuotaExceededError");
        err.name = "QuotaExceededError";
        throw err;
      }
      self.written += 1;
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
  };
  return self;
}

const thumb = (n: string) => `data:image/jpeg;base64,AAAA${n}`;

const sketch = (id: string): Sketch => ({ id, thumb: thumb(id), createdAt: "2026-01-01T00:00:00.000Z" });

describe("sketch store — reading", () => {
  it("returns an empty gallery when there is nothing stored", () => {
    expect(loadSketches(fakeStore())).toEqual([]);
    expect(parseSketches(null)).toEqual([]);
  });

  it("survives corrupt storage instead of crashing the gallery", () => {
    expect(parseSketches("{not json")).toEqual([]);
    expect(parseSketches('"a string"')).toEqual([]);
    expect(parseSketches("null")).toEqual([]);
  });

  it("drops entries that are not drawings", () => {
    const raw = JSON.stringify([
      sketch("good"),
      { id: "no-thumb" },
      { thumb: thumb("x"), createdAt: "2026-01-01" },
      { id: "bad-thumb", thumb: "https://evil.example/x.jpg", createdAt: "2026-01-01" },
      null,
      "nope",
    ]);
    const out = parseSketches(raw);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("good");
  });

  it("never returns more than the cap even if storage somehow holds more", () => {
    const many = Array.from({ length: MAX_SKETCHES + 25 }, (_, i) => sketch(`s${i}`));
    expect(parseSketches(JSON.stringify(many))).toHaveLength(MAX_SKETCHES);
  });
});

describe("sketch store — saving", () => {
  it("puts the newest drawing first", () => {
    const store = fakeStore();
    saveSketch(store, sketch("one"));
    const { sketches } = saveSketch(store, sketch("two"));
    expect(sketches.map((s) => s.id)).toEqual(["two", "one"]);
  });

  it("replaces rather than duplicates when the same id is saved again", () => {
    const store = fakeStore();
    saveSketch(store, sketch("a"));
    const { sketches } = saveSketch(store, { ...sketch("a"), thumb: thumb("newer") });
    expect(sketches).toHaveLength(1);
    expect(sketches[0].thumb).toBe(thumb("newer"));
  });

  it("keeps the gallery at its cap by dropping the oldest", () => {
    const store = fakeStore();
    for (let i = 0; i < MAX_SKETCHES; i++) saveSketch(store, sketch(`s${i}`));
    const { sketches, dropped } = saveSketch(store, sketch("newest"));
    expect(sketches).toHaveLength(MAX_SKETCHES);
    expect(dropped).toBe(1);
    expect(sketches[0].id).toBe("newest");
    // the very first drawing is the one that went
    expect(sketches.map((s) => s.id)).not.toContain("s0");
  });

  it("sheds old drawings when the browser says it is out of room", () => {
    // Room for roughly ten entries, so the eleventh has to make space.
    const store = fakeStore({ budgetBytes: 400 });
    for (let i = 0; i < 10; i++) saveSketch(store, sketch(`s${i}`));
    const before = loadSketches(store).length;
    const res = saveSketch(store, sketch("overflow"));
    expect(res.failed).toBe(false);
    expect(res.dropped).toBeGreaterThan(0);
    expect(loadSketches(store).length).toBeLessThan(before + 1);
    // and the drawing that was just saved is definitely still there
    expect(loadSketches(store)[0].id).toBe("overflow");
  });

  it("leaves the gallery intact when even trimming cannot fit it", () => {
    const store = fakeStore({ writesAllowed: 1 }); // one write, then hard refuse
    expect(saveSketch(store, sketch("first")).failed).toBe(false);
    const res = saveSketch(store, sketch("second"));
    expect(res.failed).toBe(true);
    // the old drawing is still there rather than the gallery silently emptying
    expect(res.sketches.map((s) => s.id)).toContain("first");
    expect(loadSketches(store).map((s) => s.id)).toEqual(["first"]);
  });

  it("reports failure rather than throwing when storage is disabled", () => {
    const broken: Store = {
      getItem: () => null,
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {},
    };
    expect(saveSketch(broken, sketch("x")).failed).toBe(true);
    expect(loadSketches(broken)).toEqual([]);
    expect(() => deleteSketch(broken, "x")).not.toThrow();
  });
});

describe("sketch store — deleting and ids", () => {
  it("removes just the drawing you asked for", () => {
    const store = fakeStore();
    saveSketch(store, sketch("a"));
    saveSketch(store, sketch("b"));
    saveSketch(store, sketch("c"));
    const left = deleteSketch(store, "b");
    expect(left.map((s) => s.id)).toEqual(["c", "a"]);
    expect(loadSketches(store).map((s) => s.id)).toEqual(["c", "a"]);
  });

  it("deleting something that isn't there changes nothing", () => {
    const store = fakeStore();
    saveSketch(store, sketch("a"));
    expect(deleteSketch(store, "ghost").map((s) => s.id)).toEqual(["a"]);
  });

  it("mints ids that won't collide", () => {
    const a = newSketchId(1735689600000, 42);
    const b = newSketchId(1735689600000, 43);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^sk-/);
  });
});