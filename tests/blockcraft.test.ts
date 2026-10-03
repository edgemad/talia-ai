import { describe, expect, it } from "vitest";
import {
  blockcraft,
  codeFromName,
  extractNote,
  outlineCells,
  renderWorld,
  WORLD_H,
  WORLD_W,
  type BlockcraftState,
} from "../server/blockcraft.mjs";

/** A flat, deterministic world so placement/mining rules are testable. */
function cleanState(overrides: Partial<BlockcraftState> = {}): BlockcraftState {
  const rows = Array.from({ length: WORLD_H }, () => new Array<string>(WORLD_W).fill(" "));
  for (let x = 0; x < WORLD_W; x++) {
    rows[9][x] = "s";
    rows[10][x] = "s";
    rows[11][x] = "s";
  }
  return {
    rows,
    px: 10,
    py: 8,
    facing: 1,
    inv: { d: 0, s: 5, w: 20, l: 4, g: 4, b: 10, c: 0, i: 0 },
    turn: 0,
    mined: 0,
    placed: 0,
    goal: 24,
    blueprint: null,
    status: "playing",
    ...overrides,
  };
}

const reply = (r: { reply?: string }) => String(r.reply ?? "");

describe("blockcraft world", () => {
  it("generates a bounded world with the player standing on solid ground", () => {
    const s = blockcraft.seed({});
    expect(s.rows.length).toBe(WORLD_H);
    for (const row of s.rows) expect(row.length).toBe(WORLD_W);
    expect(s.status).toBe("playing");
    expect(s.px).toBeGreaterThanOrEqual(0);
    expect(s.px).toBeLessThan(WORLD_W);
    // The cell the player stands in is air…
    expect(s.rows[s.py][s.px]).toBe(" ");
    // …and there is solid ground underneath them.
    expect(s.rows[s.py + 1][s.px]).toBeTruthy();
  });

  it("starts with building blocks so the player can begin immediately", () => {
    const s = blockcraft.seed({});
    const carry = Object.values(s.inv).reduce((a, b) => a + b, 0);
    expect(carry).toBeGreaterThan(0);
  });

  it("renders a framed world and shows the player", () => {
    const art = renderWorld(cleanState());
    expect(art.split("\n").length).toBe(WORLD_H + 2);
    expect(art).toContain("@");
    expect(art).toContain("┌");
  });

  it("opens with the world and the command list", () => {
    const intro = blockcraft.intro(cleanState());
    expect(intro.length).toBeGreaterThan(40);
    expect(intro).toMatch(/mine/);
    expect(intro).toMatch(/blueprint/);
  });
});

describe("blockcraft mining and building", () => {
  it("places a block in the faced cell and spends inventory", () => {
    const s = cleanState();
    const r = blockcraft.step(s, "place wood");
    expect(r.state.rows[8][11]).toBe("w");
    expect(r.state.inv.w).toBe(19);
    expect(r.state.placed).toBe(1);
    expect(reply(r)).toContain("Placed wood");
  });

  it("builds at exact coordinates and above/below", () => {
    let s = blockcraft.step(cleanState(), "place stone at 2 3").state;
    expect(s.rows[3][2]).toBe("s");
    s = blockcraft.step(s, "place glass up").state;
    expect(s.rows[7][10]).toBe("g");
    s = blockcraft.step(s, "place brick down at 10 5").state;
    expect(s.rows[5][10]).toBe("b");
  });

  it("refuses unknown blocks and empty inventory without breaking", () => {
    let s = cleanState({ inv: { d: 0, s: 0, w: 0, l: 0, g: 0, b: 0, c: 0, i: 0 } });
    const r1 = blockcraft.step(s, "place wood");
    expect(reply(r1)).toMatch(/out of wood/i);
    expect(r1.state.placed).toBe(0);
    s = r1.state;
    const r2 = blockcraft.step(s, "place unicorn");
    expect(reply(r2)).toMatch(/which block/i);
    expect(r2.state.status).toBe("playing");
  });

  it("refuses to build into a solid cell", () => {
    const s = cleanState();
    s.rows[8][11] = "s";
    const r = blockcraft.step(s, "place wood");
    expect(reply(r)).toMatch(/already there/i);
    expect(r.state.rows[8][11]).toBe("s");
  });

  it("mines the faced block into the inventory", () => {
    const s = cleanState();
    s.rows[8][11] = "d";
    const r = blockcraft.step(s, "mine");
    expect(r.state.rows[8][11]).toBe(" ");
    expect(r.state.inv.d).toBe(1);
    expect(r.state.mined).toBe(1);
    expect(reply(r)).toMatch(/Mined dirt/);
  });

  it("drops you into a hole you dig straight down", () => {
    const r = blockcraft.step(cleanState(), "mine down");
    expect(r.state.rows[9][10]).toBe(" ");
    expect(r.state.py).toBe(9);
  });

  it("says so when there is only air to mine", () => {
    const r = blockcraft.step(cleanState(), "mine up");
    expect(reply(r)).toMatch(/just air/i);
    expect(r.state.mined).toBe(0);
  });

  it("never mutates the state it was given", () => {
    const s = cleanState();
    const before = JSON.stringify(s.rows);
    blockcraft.step(s, "place wood");
    blockcraft.step(s, "mine down");
    expect(JSON.stringify(s.rows)).toBe(before);
  });
});

describe("blockcraft movement", () => {
  it("walks and turns to face the way it moved", () => {
    const r = blockcraft.step(cleanState(), "move left");
    expect(r.state.px).toBe(9);
    expect(r.state.facing).toBe(-1);
  });

  it("auto-steps up a one-block ledge", () => {
    const s = cleanState();
    s.rows[8][11] = "s";
    const r = blockcraft.step(s, "move right");
    expect(r.state.px).toBe(11);
    expect(r.state.py).toBe(7);
  });

  it("is blocked when the ledge has no headroom", () => {
    const s = cleanState();
    s.rows[8][11] = "s";
    s.rows[7][11] = "w";
    const r = blockcraft.step(s, "move right");
    expect(r.state.px).toBe(10);
    expect(reply(r)).toMatch(/in the way/i);
  });

  it("stops at the edge of the world", () => {
    const s = cleanState({ px: WORLD_W - 2 });
    const r = blockcraft.step(s, "move right");
    expect(r.state.px).toBe(WORLD_W - 2);
    expect(reply(r)).toMatch(/edge of the world/i);
  });
});

describe("blockcraft blueprints (the LLM architect)", () => {
  it("hands a design request to the model", () => {
    const r = blockcraft.step(cleanState(), "blueprint cosy cabin");
    expect(r.needsLlm).toBe(true);
    expect(r.prompt).toBe("cosy cabin");
    expect(r.state.want).toBe("cosy cabin");
    expect(blockcraft.systemPrompt(r.state)).toContain("cosy cabin");
    expect(blockcraft.systemPrompt(r.state)).toContain("BUILD");
  });

  it("turns a BUILD spec into blueprint cells", () => {
    const s = blockcraft.parseLlmReply(cleanState(), "A snug little cabin. BUILD 8x4 wood")!;
    expect(s.blueprint).not.toBeNull();
    expect(s.blueprint!.w).toBe(8);
    expect(s.blueprint!.h).toBe(4);
    expect(s.blueprint!.mat).toBe("w");
    expect(s.blueprint!.cells.length).toBe(20); // outline of 8x4
    expect(s.blueprint!.filled.every((f) => f === false)).toBe(true);
  });

  it("clamps silly sizes and understands materials", () => {
    const s = blockcraft.parseLlmReply(cleanState(), "BUILD 40x99 glass")!;
    expect(s.blueprint!.w).toBe(12);
    expect(s.blueprint!.h).toBe(6);
    expect(s.blueprint!.mat).toBe("g");
  });

  it("ignores a reply with no BUILD spec", () => {
    expect(blockcraft.parseLlmReply(cleanState(), "Sorry, how about a castle?")).toBeNull();
  });

  it("fills the blueprint and wins", () => {
    const withBp = blockcraft.parseLlmReply(cleanState(), "BUILD 4x3 wood")!;
    const r = blockcraft.step(withBp, "fill");
    expect(r.state.blueprint!.filled.every(Boolean)).toBe(true);
    expect(r.state.status).toBe("won");
    expect(r.state.placed).toBe(10);
    expect(reply(r)).toMatch(/Blueprint complete/i);
    expect(typeof r.state.score).toBe("number");
  });

  it("fills only what you are carrying", () => {
    const withBp = blockcraft.parseLlmReply(cleanState(), "BUILD 8x4 wood")!;
    const poor = { ...withBp, inv: { ...withBp.inv, w: 3 } };
    const r = blockcraft.step(poor, "fill");
    expect(r.state.placed).toBe(3);
    expect(r.state.status).toBe("playing");
    expect(reply(r)).toMatch(/Built 3/);
  });

  it("has an offline fallback that still lets you build", () => {
    const fb = blockcraft.fallback(cleanState());
    expect(fb.length).toBeGreaterThan(20);
    expect(fb).toMatch(/architect/i);
  });
});

describe("blockcraft win conditions", () => {
  it("wins on the block goal when there is no blueprint", () => {
    const s = cleanState({ goal: 5 });
    const r = blockcraft.step(s, "fill");
    expect(r.state.placed).toBeGreaterThanOrEqual(5);
    expect(r.state.status).toBe("won");
    expect(reply(r)).toMatch(/Goal reached/i);
  });

  it("refuses further moves once the world is saved", () => {
    const done = cleanState({ status: "won" });
    const r = blockcraft.step(done, "place wood");
    expect(r.state.status).toBe("won");
    expect(reply(r)).toMatch(/saved/i);
  });
});

describe("blockcraft helpers", () => {
  it("computes rectangle outlines without duplicates", () => {
    const cells = outlineCells(0, 0, 4, 3);
    expect(cells.length).toBe(10);
    expect(new Set(cells.map(([x, y]) => `${x},${y}`)).size).toBe(cells.length);
  });

  it("maps friendly block names to codes", () => {
    expect(codeFromName("logs")).toBe("w");
    expect(codeFromName("Bricks")).toBe("b");
    expect(codeFromName("window")).toBe("g");
    expect(codeFromName("diamond")).toBeNull();
  });

  it("shows unplaced blueprint cells as + ghosts", () => {
    const s = blockcraft.parseLlmReply(cleanState(), "BUILD 4x3 wood")!;
    const art = renderWorld(s);
    expect(art).toContain("+");
  });
});

describe("blockcraft graphical controls", () => {
  it("picks a hotbar block, and bare `select` cycles through the buildable ones", () => {
    const picked = blockcraft.step(cleanState(), "select glass").state;
    expect(picked.sel).toBe("g");
    const cycled = blockcraft.step(picked, "select").state;
    expect(["d", "s", "w", "l", "g", "b"]).toContain(cycled.sel);
    expect(cycled.sel).not.toBe("g");
  });

  it("refuses to hold an ore, since you can't build with one", () => {
    const r = blockcraft.step(cleanState(), "select coal");
    expect(reply(r)).toMatch(/ore/i);
    expect(r.state.sel).toBeUndefined();
  });

  it("builds with the held block when no name is given (hotbar tap)", () => {
    const s = cleanState({ sel: "g" });
    const r = blockcraft.step(s, "place at 11 8");
    expect(r.state.rows[8][11]).toBe("g");
    expect(reply(r)).toMatch(/Placed glass/);
  });

  it("jumps up a block and refuses when something is overhead", () => {
    expect(blockcraft.step(cleanState(), "jump").state.py).toBe(7);
    const capped = cleanState();
    capped.rows[7][10] = "w";
    const r = blockcraft.step(capped, "jump");
    expect(r.state.py).toBe(8);
    expect(reply(r)).toMatch(/above your head/i);
  });

  it("seeds a hotbar selection and a reach the canvas can draw", () => {
    const s = blockcraft.seed({});
    expect(s.sel).toBe("w");
    expect(s.reach).toBeGreaterThan(0);
  });
});

describe("blockcraft GUI mode (what the canvas sends)", () => {
  const quiet = (s: BlockcraftState, cmd: string, extra: Record<string, unknown> = {}) =>
    blockcraft.step(s, cmd, { quiet: true, creative: true, reach: 6, ...extra });

  it("keeps mining and placing inside arm's reach", () => {
    const near = quiet(cleanState(), "mine at 11 9");
    expect(near.state.rows[9][11]).toBe(" ");
    const far = quiet(cleanState(), "mine at 25 11");
    expect(far.state.rows[11][25]).toBe("s");
    expect(far.note).toMatch(/too far to reach/i);
    expect(far.state.mined).toBe(0);
  });

  it("leaves reach unlimited in chat mode, so power users can still build afar", () => {
    const s = cleanState();
    const r = blockcraft.step(s, "mine at 2 9");
    expect(r.state.rows[9][2]).toBe(" ");
    expect(r.state.mined).toBe(1);
  });

  it("attaches a one-line note and never dead-ends the world", () => {
    const r = quiet(cleanState(), "mine down");
    expect(r.note).toContain("Mined stone");
    expect(r.note).not.toContain("│");
    expect(r.note).not.toContain("📍");
    // Hitting the goal celebrates but the sandpit stays open.
    const goal = quiet({ ...cleanState(), goal: 4 }, "fill");
    expect(goal.state.status).toBe("playing");
    expect(goal.state.celebrated).toBe(true);
    expect(goal.note).toMatch(/goal reached/i);
    const again = quiet(goal.state, "mine down");
    expect(again.note).not.toMatch(/goal reached/i);
    expect(again.state.mined).toBeGreaterThan(0);
  });

  it("refuses model-only verbs so the canvas can never stall on a stream", () => {
    const r = quiet(cleanState(), "blueprint cosy cabin");
    expect(r.needsLlm).toBe(true);
  });

  it("keeps every turn in the same chat session alive", () => {
    let s = cleanState();
    for (const cmd of ["mine down", "move right", "place w at 12 8", "mine down"]) s = quiet(s, cmd).state;
    expect(s.turn).toBe(4);
    expect(s.mined).toBe(2);
    expect(s.placed).toBe(1);
    expect(s.rows[8][12]).toBe("w");
    expect([s.px, s.py]).toEqual([11, 9]);
  });
});

describe("extractNote", () => {
  it("strips the framed world, the legend and the status line", () => {
    const note = extractNote(blockcraft.step(cleanState(), "mine down").reply ?? "");
    expect(note).toBe("⛏ Mined stone!");
    expect(extractNote("")).toBe("");
  });
});
