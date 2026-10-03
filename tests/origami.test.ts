import { describe, expect, it } from "vitest";
import {
  BASES,
  HACKS,
  MODELS,
  allFoldables,
  byDifficulty,
  findFoldable,
  findHack,
  totalSteps,
  type Figure,
  type Foldable,
} from "../src/lib/origami";

const all = allFoldables();

/** Every point must sit inside the 0..100 box the renderer draws. */
function insideFigure(f: Figure): boolean {
  const pts = [
    ...f.outline,
    ...(f.flap?.points ?? []),
    ...(f.creases ?? []).flatMap((c) => [c.a, c.b]),
    ...(f.arrow ? [f.arrow.from, f.arrow.to] : []),
    ...(f.notes ?? []).map((n) => n.at),
  ];
  return pts.every(([x, y]) => x >= -2 && x <= 102 && y >= -2 && y <= 102);
}

describe("paper folding — the library", () => {
  it("has plenty to fold and plenty of tricks", () => {
    expect(MODELS.length).toBeGreaterThanOrEqual(8);
    expect(BASES.length).toBeGreaterThanOrEqual(3);
    expect(HACKS.length).toBeGreaterThanOrEqual(8);
    expect(totalSteps()).toBeGreaterThan(40);
  });

  it("gives every fold a unique id, an emoji and a blurb", () => {
    const ids = all.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of all) {
      expect(f.id).toMatch(/^[a-z0-9-]+$/);
      expect(f.name.length).toBeGreaterThan(2);
      expect(f.blurb.length).toBeGreaterThan(15);
      // a kid should know what they're about to attempt
      expect(["easy", "medium", "hard"]).toContain(f.difficulty);
      expect(f.minutes).toBeGreaterThanOrEqual(1);
      expect(f.minutes).toBeLessThanOrEqual(30);
      expect(f.paper.length).toBeGreaterThan(3);
    }
  });

  it("writes every instruction as a short, physical command", () => {
    for (const f of all) {
      for (const [i, s] of f.steps.entries()) {
        const where = `${f.id} step ${i + 1}`;
        expect(s.text.length, `${where} is too long to read at a glance`).toBeGreaterThan(8);
        expect(s.text.length, `${where} is too wordy`).toBeLessThan(140);
        // imperative: a child follows a command, not a description
        expect(/^(Fold|Make|Turn|Lift|Petal|Squash|Pinch|Pull|Push|Slide|Spread|Keep|Open|Unfold|Done|Start)/.test(s.text), `${where} doesn't read as a command: "${s.text}"`).toBe(true);
        if (s.tip) expect(s.tip.length).toBeGreaterThan(8);
      }
    }
  });

  it("gives every step a drawable figure inside the 100x100 box", () => {
    for (const f of all) {
      for (const [i, s] of f.steps.entries()) {
        const where = `${f.id} step ${i + 1}`;
        expect(s.figure, `${where} has no figure`).toBeTruthy();
        expect(s.figure.outline.length, `${where} outline is not a polygon`).toBeGreaterThanOrEqual(3);
        expect(insideFigure(s.figure), `${where} draws outside its box`).toBe(true);
        // A step with neither a crease nor an arrow gives a child nothing to do.
        // Two steps are legitimately action-free: the last one ("look what you
        // made") and any step that just points at another fold to make first.
        const hasAction = !!s.figure.flap || !!s.figure.arrow || !!s.figure.creases?.length;
        if (i === f.steps.length - 1) {
          expect(f.steps.length).toBeGreaterThan(1);
        } else if (s.ref) {
          expect(findFoldable(s.ref), `${where} points at a fold that doesn't exist: ${s.ref}`).toBeTruthy();
        } else {
          expect(hasAction, `${where} shows no fold and no movement`).toBe(true);
        }
      }
    }
  });

  it("only uses crease kinds the renderer knows how to draw", () => {
    for (const f of all) {
      for (const s of f.steps) {
        for (const c of s.figure.creases ?? []) {
          expect(["valley", "mountain", "plain"]).toContain(c.kind ?? "valley");
        }
      }
    }
  });

  it("never promises a fold without a step", () => {
    for (const f of all) expect(f.steps.length).toBeGreaterThanOrEqual(4);
  });

  it("only ever points at a fold that actually exists", () => {
    for (const f of all) {
      for (const s of f.steps) {
        if (!s.ref) continue;
        const target = findFoldable(s.ref);
        expect(target, `${f.id} points at missing fold "${s.ref}"`).toBeTruthy();
        expect(target!.id, `${f.id} points at itself`).not.toBe(f.id);
      }
    }
  });

  it("looks things up by id and returns nothing for nonsense", () => {
    expect(findFoldable("crane")?.name).toBe("Paper Crane");
    expect(findFoldable("square-base")).toBeTruthy();
    expect(findFoldable("no-such-fold")).toBeUndefined();
    expect(findHack("crease-sharp")?.title).toBe("Crease sharply, then unfold");
    expect(findHack("nope")).toBeUndefined();
  });

  it("sorts easiest first without mutating the source", () => {
    const before = MODELS.map((m) => m.id);
    const sorted = byDifficulty(MODELS);
    const rank = { easy: 0, medium: 1, hard: 2 } as const;
    for (let i = 1; i < sorted.length; i++) {
      expect(rank[sorted[i - 1].difficulty]).toBeLessThanOrEqual(rank[sorted[i].difficulty]);
    }
    expect(MODELS.map((m) => m.id)).toEqual(before);
  });

  it("puts a character and a hack before you need the jargon to explain it", () => {
    // Every hard fold should point the reader at a base or a trick.
    for (const f of all.filter((x) => x.difficulty === "hard")) {
      const pointsSomewhere = f.steps.some((s) => /base|inside-reverse|petal|squash/i.test(s.text + (s.tip ?? "")));
      expect(pointsSomewhere, `${f.id} is hard but never explains the move it needs`).toBe(true);
    }
  });
});

describe("paper folding — hacks", () => {
  it("gives every trick a body and a reason", () => {
    for (const h of HACKS) {
      expect(h.title.length).toBeGreaterThan(8);
      expect(h.body.length).toBeGreaterThan(60);
      expect(h.why.length).toBeGreaterThan(30);
      expect(h.emoji.length).toBeGreaterThan(0);
    }
  });

  it("explains the fold that beginners actually get wrong", () => {
    const ids = HACKS.map((h) => h.id);
    // The four moves that make or break nearly every model.
    for (const must of ["crease-sharp", "mountain-valley", "squash-fold", "reverse-fold"]) {
      expect(ids, `missing the "${must}" trick`).toContain(must);
    }
  });
});

describe("paper folding — helpers", () => {
  it("counts every fold in the library", () => {
    const expected = all.reduce((n: number, f: Foldable) => n + f.steps.length, 0);
    expect(totalSteps()).toBe(expected);
  });
});