import { describe, expect, it } from "vitest";
import { SKETCH_COLORS, SKETCH_TOOLS } from "../src/components/SketchPad";

// The drawing pad's configuration is what a child actually touches, so it gets
// checked rather than assumed: a tool with no label, or a colour that isn't a
// colour, is a button that does nothing.

describe("sketch pad — tools", () => {
  it("offers the eight things a drawing needs", () => {
    const ids = SKETCH_TOOLS.map((t) => t.id);
    expect(ids).toEqual(["pencil", "marker", "crayon", "eraser", "line", "rect", "circle", "stamp"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("labels every tool and says what it does", () => {
    for (const t of SKETCH_TOOLS) {
      expect(t.label.length, `${t.id} has no label`).toBeGreaterThan(2);
      expect(t.hint.length, `${t.id} has no hint`).toBeGreaterThan(3);
      // Most emoji are a single codepoint, so just check there is one at all —
      // an empty icon renders as a blank button that does nothing.
      expect(t.icon.trim().length, `${t.id} has no icon`).toBeGreaterThan(0);
    }
  });
});

describe("sketch pad — colours", () => {
  it("gives a full palette of usable colours", () => {
    expect(SKETCH_COLORS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SKETCH_COLORS).size).toBe(SKETCH_COLORS.length);
  });

  it("only uses colours the canvas can actually paint", () => {
    for (const c of SKETCH_COLORS) {
      expect(c, `"${c}" is not a hex colour`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("includes something dark and something bright", () => {
    // A palette of pale colours is unusable for a child on a white page.
    const hasDark = SKETCH_COLORS.some((c) => {
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      return (r * 299 + g * 587 + b * 114) / 1000 < 90;
    });
    const hasBright = SKETCH_COLORS.some((c) => {
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      return Math.max(r, g, b) > 200;
    });
    expect(hasDark).toBe(true);
    expect(hasBright).toBe(true);
  });
});