import { describe, expect, it } from "vitest";
import {
  GOAL_X,
  LEVEL,
  LEVEL_H,
  LEVEL_SPECS,
  LEVEL_W,
  PLAYER_H,
  TILE,
  advance,
  cameraX,
  coinsTotal,
  encodeInput,
  idle,
  isSolidTile,
  levelTiles,
  makeState,
  progress,
  renderWorld,
  solidAt,
  summarize,
  tick,
  type MarioState,
} from "../shared/marioCore.mjs";
import { mario, inputFor, MAX_TICKS } from "../server/mario.mjs";

/**
 * A bot that reacts to what is in front of it. Keeps the jump held long enough
 * to clear the gaps and the pipes — this is the stand-in for a child who can
 * see the level coming, so "the level is completable" stays true.
 */
function autopilot(seed = makeState()): MarioState {
  let s = seed;
  let hold = 0;
  for (let i = 0; i < 60 * 150 && s.status === "playing"; i++) {
    const bodyY = Math.floor((s.py + 7) / TILE);
    const footY = Math.floor((s.py + 18) / TILE);
    let want = false;
    for (let d = 22; d <= 34; d += 6) {
      const tx = Math.floor((s.px + d) / TILE);
      if (!solidAt(tx, footY, s.level) && !solidAt(tx + 1, footY, s.level)) want = true; // gap
      if (solidAt(tx, bodyY, s.level) || solidAt(tx + 1, bodyY, s.level)) want = true; // wall or pipe
    }
    if (s.enemies.some((e) => e.alive && e.x > s.px - 6 && e.x - s.px < 30 && Math.abs(e.y - s.py) < 24)) {
      want = true;
    }
    if (s.onGround && want) hold = 16;
    const jump = hold > 0;
    if (hold > 0) hold -= 1;
    s = tick(s, encodeInput({ right: true, jump }));
  }
  return s;
}

/** Where the longest clear stretch of level one starts — floor and body both free. */
function longestClearRun(): number {
  const rows = levelTiles(0);
  const clear = (x: number) => x < LEVEL_W && isSolidTile(rows[12][x]) && !isSolidTile(rows[11][x]);
  let bestAt = 0;
  let bestLen = 0;
  let start = 0;
  for (let x = 0; x <= LEVEL_W; x++) {
    if (clear(x)) continue;
    if (x - start > bestLen) {
      bestLen = x - start;
      bestAt = start;
    }
    start = x + 1;
  }
  return bestAt;
}

/** Drop the given player into a pit and let the fall actually play out. */
function fallFrom(s: MarioState): MarioState {
  const lives = s.lives;
  let out: MarioState = { ...s, px: 25 * TILE, py: 11 * TILE, vy: 6, invuln: 0 };
  for (let i = 0; i < 120 && out.lives === lives; i++) out = tick(out, "-");
  return out;
}

function fallIntoPit(): MarioState {
  return fallFrom(makeState());
}

describe("mario core — level", () => {
  it("builds a rectangular level with a solid floor and a goal", () => {
    expect(LEVEL).toHaveLength(LEVEL_H);
    for (const row of LEVEL) expect(row).toHaveLength(LEVEL_W);
    expect(solidAt(0, LEVEL_H - 1)).toBe(true);
    expect(solidAt(LEVEL_W - 1, 0)).toBe(false);
    expect(LEVEL.some((r) => r.includes("F"))).toBe(true);
  });

  it("only ground, ledges, pipes and blocks are solid", () => {
    for (const ch of ["#", "=", "P", "Q"]) expect(isSolidTile(ch)).toBe(true);
    // bushes are scenery you walk through; coins and critters are not walls
    for (const ch of [".", "o", "^", "F", "B"]) expect(isSolidTile(ch)).toBe(false);
  });

  it("puts pipes and blocks on the level, clear of the critters", () => {
    const pipes = LEVEL.filter((r) => r.includes("P")).length;
    expect(pipes).toBeGreaterThan(0);
    expect(LEVEL.some((r) => r.includes("Q"))).toBe(true);
    // a spawn buried inside a pipe would pace about in there forever
    for (const e of makeState().enemies) {
      const tx = Math.floor(e.x / TILE);
      const ty = Math.floor(e.y / TILE);
      expect(isSolidTile(LEVEL[ty][tx])).toBe(false);
      // and it must be standing on something
      expect(isSolidTile(LEVEL[ty + 1][tx])).toBe(true);
    }
  });

  it("puts the walls just outside the level so you cannot leave it", () => {
    expect(solidAt(-1, 5)).toBe(true);
    expect(solidAt(LEVEL_W, 5)).toBe(true);
  });

  it("leaves the ground open in gaps and solid between them", () => {
    expect(solidAt(3, 12)).toBe(true);
    expect(solidAt(25, 12)).toBe(false); // a pit
  });
});

describe("mario core — the level select", () => {
  /** Runs of missing floor, i.e. the gaps a jump has to clear. */
  function pits(level: number): number[][] {
    const ground = levelTiles(level)[12];
    const runs: number[][] = [];
    let start = -1;
    for (let x = 0; x <= LEVEL_W; x++) {
      const gap = x < LEVEL_W && !isSolidTile(ground[x]);
      if (gap && start < 0) start = x;
      if (!gap && start >= 0) {
        runs.push([start, x - 1]);
        start = -1;
      }
    }
    return runs;
  }

  it("offers several levels, each named, numbered and its own terrain", () => {
    expect(LEVEL_SPECS.length).toBeGreaterThanOrEqual(6);
    for (const [i, l] of LEVEL_SPECS.entries()) {
      expect(l.id).toMatch(/^\d-\d$/);
      expect(l.name.length).toBeGreaterThan(3);
      expect(l.blurb.length).toBeGreaterThan(10);
      expect(l.lives).toBeGreaterThanOrEqual(3);
      // the terrain really is per-level, not the same grid six times
      expect(levelTiles(i)).toHaveLength(LEVEL_H);
      expect(levelTiles(i)[12]).toHaveLength(LEVEL_W);
    }
    expect(new Set(LEVEL_SPECS.map((l) => l.id)).size).toBe(LEVEL_SPECS.length);
    expect(new Set(levelTiles().join("|")).size).toBeGreaterThan(1);
  });

  it("starts a round on the level you asked for, with that level's lives", () => {
    for (const [i, l] of LEVEL_SPECS.entries()) {
      const s = makeState({ level: i });
      expect(s.level).toBe(i);
      expect(s.levelId).toBe(l.id);
      expect(s.levelName).toBe(l.name);
      expect(s.levelCount).toBe(LEVEL_SPECS.length);
      expect(s.lives).toBe(l.lives);
    }
  });

  it("clamps a level number that arrives off the wire", () => {
    expect(makeState({ level: 99 }).level).toBe(LEVEL_SPECS.length - 1);
    expect(makeState({ level: -4 }).level).toBe(0);
    expect(makeState({ level: Number.NaN }).level).toBe(0);
    expect(levelTiles(99)).toEqual(levelTiles(LEVEL_SPECS.length - 1));
    expect(solidAt(3, 12, 99)).toBe(true);
  });

  it("never opens a gap wider than a running jump", () => {
    // Three tiles is what a run clears with room to spare; four is where the
    // bot — and, more to the point, a five-year-old — starts missing.
    for (let i = 0; i < LEVEL_SPECS.length; i++) {
      for (const [a, b] of pits(i)) expect(b - a + 1, `${LEVEL_SPECS[i].id} gap at ${a}`).toBeLessThanOrEqual(3);
    }
  });

  it("leaves every pipe standable — nothing overhead, floor to land on", () => {
    // Regression: a ledge over a pipe meant you jumped, thumped your head and
    // dropped into whatever was behind it, which made the level unfinishable.
    for (let i = 0; i < LEVEL_SPECS.length; i++) {
      const rows = levelTiles(i);
      for (let x = 0; x < LEVEL_W; x++) {
        // Only look at a pipe's left column, so we check each one once.
        if (rows[10][x] !== "P" || (x > 0 && rows[10][x - 1] === "P")) continue;
        expect(rows[10][x + 1]).toBe("P");
        for (let y = 5; y <= 9; y++) {
          expect(isSolidTile(rows[y][x]), `${LEVEL_SPECS[i].id} roof over pipe at ${x}`).toBe(false);
          expect(isSolidTile(rows[y][x + 1]), `${LEVEL_SPECS[i].id} roof over pipe at ${x + 1}`).toBe(false);
        }
        // somewhere solid to come down on, both before and after
        for (let d = -3; d <= 4; d++) expect(isSolidTile(rows[12][x + d])).toBe(true);
      }
    }
  });

  it("keeps the run-up to every gap clear", () => {
    for (let i = 0; i < LEVEL_SPECS.length; i++) {
      const rows = levelTiles(i);
      for (const [a] of pits(i)) {
        for (let x = a - 6; x < a; x++) {
          for (let y = 5; y <= 11; y++) {
            expect(isSolidTile(rows[y][x]), `${LEVEL_SPECS[i].id} ledge at ${x},${y} blocks the jump at ${a}`).toBe(false);
          }
        }
      }
    }
  });

  it("never parks a critter over a hole or in front of one", () => {
    for (let i = 0; i < LEVEL_SPECS.length; i++) {
      const rows = levelTiles(i);
      const gaps = pits(i);
      for (const e of makeState({ level: i }).enemies) {
        const tx = Math.floor(e.x / TILE);
        expect(isSolidTile(rows[12][tx]), `${LEVEL_SPECS[i].id} critter floating over a hole`).toBe(true);
        // and never standing in the tiles you need to take off from
        for (const [a] of gaps) expect(tx >= a - 6 && tx <= a - 1).toBe(false);
      }
    }
  });

  it("never puts you back inside a pipe", () => {
    // Regression: the rescue only checked the floor, so it happily chose a
    // column whose body tile was a pipe and wedged the player in it for good.
    for (let i = 0; i < LEVEL_SPECS.length; i++) {
      const rows = levelTiles(i);
      for (const [a] of pits(i)) {
        let s: MarioState = { ...makeState({ level: i }), px: a * TILE + 3, py: 12 * TILE, vy: 8, invuln: 0 };
        const lives = s.lives;
        for (let k = 0; k < 120 && s.lives === lives; k++) s = tick(s, "-");
        const tx = Math.floor(s.px / TILE);
        expect(isSolidTile(rows[11][tx]), `${LEVEL_SPECS[i].id} respawned inside solid ground`).toBe(false);
        expect(isSolidTile(rows[12][tx])).toBe(true);
      }
    }
  });

  it("every level can actually be finished", () => {
    // The whole point of the level select. A level a child cannot complete is
    // worse than not offering it, so the bot flies every single one.
    for (const [i, l] of LEVEL_SPECS.entries()) {
      const s = autopilot(makeState({ level: i }));
      expect(s.status, `${l.id} ${l.name} was not completable`).toBe("won");
      expect(s.px).toBeGreaterThanOrEqual(GOAL_X * TILE - TILE);
    }
  });
});

describe("mario core — simulation", () => {
  it("spawns a player standing on the ground with lives in the bank", () => {
    const s = makeState();
    expect(s.status).toBe("playing");
    expect(s.lives).toBe(5);
    expect(s.score).toBe(0);
    expect(s.onGround).toBe(true);
    expect(s.tick).toBe(0);
  });

  it("does not sink into the floor when left alone", () => {
    const start = makeState();
    const s = advance(start, "-".repeat(120));
    expect(s.py).toBe(start.py);
    expect(s.onGround).toBe(true);
  });

  it("runs right when told to and stops when told to stop", () => {
    // Physics only — no critters, and started on the longest stretch of level
    // one with nothing in the way, so this measures running rather than scenery.
    const bare: MarioState = { ...makeState(), enemies: [], px: longestClearRun() * TILE };
    const s = advance(bare, "r".repeat(60));
    expect(s.px).toBeGreaterThan(bare.px + 100);
    expect(s.vx).toBeGreaterThan(2);
    const still = advance(s, "-".repeat(30));
    // friction brings you to a halt; it just doesn't teleport you to a stop
    expect(still.vx).toBe(0);
    expect(Math.abs(still.px - s.px)).toBeLessThan(20);
    expect(advance(still, "-".repeat(10)).px).toBe(still.px);
  });

  it("is deterministic — the same inputs always give the same state", () => {
    const a = advance(makeState(), "Rrr-rrlL".repeat(30));
    const b = advance(makeState(), "Rrr-rrlL".repeat(30));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("gives the same result however the inputs are split into batches", () => {
    // This is the guarantee the whole client/server sync rests on: the canvas
    // ships ~12 ticks every 200ms while the server replays them, so batching
    // must never change the outcome. `events` is a per-call report rather than
    // state, so it is the one field allowed to differ.
    const all = "Rrr-rrlL".repeat(30);
    const world = (s: MarioState) => JSON.stringify({ ...s, events: undefined });
    const oneShot = advance(makeState(), all);
    const chunked = all.match(/.{1,7}/g)!.reduce((acc, part) => advance(acc, part), makeState());
    const oneAtATime = [...all].reduce((acc, ch) => advance(acc, ch), makeState());
    expect(world(chunked)).toBe(world(oneShot));
    expect(world(oneAtATime)).toBe(world(oneShot));
  });

  it("leaves the input state untouched so a client can rewind", () => {
    const before = makeState();
    const snapshot = JSON.stringify(before);
    tick(before, "R");
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("jumps higher the longer the button is held", () => {
    const tap = advance(makeState(), "j");
    const held = advance(makeState(), "jjjjjjjjjjjjjj");
    const topOf = (s: MarioState) => 12 * TILE - PLAYER_H - s.py;
    expect(topOf(held)).toBeGreaterThan(topOf(tap));
  });

  it("collects a coin when you run through it", () => {
    const s = makeState();
    const coin = s.coins[0];
    const placed = tick({ ...s, px: coin.x * TILE + 2, py: coin.y * TILE + 2 }, "-");
    expect(placed.coinsGot).toBe(1);
    expect(placed.score).toBe(10);
    expect(placed.coins.find((c) => c.x === coin.x)?.got).toBe(true);
  });

  it("stops at a wall instead of tunnelling through it", () => {
    const start = makeState();
    const wall = { ...start, px: 0, py: 2 * TILE };
    // Row 2 is open sky, so drop in beside solid ground and charge the left wall.
    const shoved = advance(wall, "l".repeat(240));
    expect(shoved.px).toBeGreaterThanOrEqual(0);
  });

  it("costs a life when you fall into a pit, and puts you back on solid ground", () => {
    const start = makeState();
    const s = fallIntoPit();
    expect(s.lives).toBe(start.lives - 1);
    expect(s.status).toBe("playing");
    expect(solidAt(Math.floor(s.px / TILE), 12)).toBe(true);
    expect(s.invuln).toBeGreaterThan(0);
  });

  it("respawns with runway, never balanced on the lip of a gap", () => {
    const s = fallIntoPit();
    const tile = Math.floor(s.px / TILE);
    // three tiles of solid ground ahead of you, so you can build up speed
    expect(solidAt(tile, 12)).toBe(true);
    expect(solidAt(tile + 1, 12)).toBe(true);
    expect(solidAt(tile + 2, 12)).toBe(true);
  });

  it("lets you stomp a critter for points and a bounce", () => {
    const start = makeState();
    const foe = start.enemies[0];
    const above: MarioState = {
      ...start,
      px: foe.x,
      py: foe.y - PLAYER_H - 2,
      vy: 4,
      onGround: false,
    };
    const s = tick(above, "-");
    expect(s.enemies[0].alive).toBe(false);
    expect(s.score).toBe(100);
    expect(s.vy).toBeLessThan(0);
  });

  it("keeps hopping while jump is held, instead of getting stuck after one leap", () => {
    // Regression: jumping fired only on the button's rising edge, so a child who
    // held jump got one leap and was then wedged against a pipe forever.
    const start = makeState();
    let s = start;
    let peaks = 0;
    let wasAir = false;
    for (let i = 0; i < 600; i++) {
      s = tick(s, "R");
      if (s.onGround && wasAir) peaks += 1;
      if (!s.onGround) wasAir = true;
    }
    expect(peaks).toBeGreaterThan(2); // several hops, not just the first
    expect(s.px).toBeGreaterThan(start.px + 60); // and it kept making progress
  });

  it("does not emit a pit event forever when falling while invulnerable", () => {
    // Regression: a pit fall while still blinking skipped the rescue, leaving
    // the player below the world emitting "pit" every tick and wedging the game.
    const start = makeState();
    let s: MarioState = { ...start, px: 25 * TILE, py: 12 * TILE, vy: 8, invuln: 40 };
    let pitTicks = 0;
    // fall all the way down until the rescue happens...
    for (let i = 0; i < 60 && pitTicks === 0; i++) {
      s = tick(s, "-");
      pitTicks += s.events.filter((e) => e === "pit").length;
    }
    expect(pitTicks).toBe(1);
    expect(s.py).toBeLessThan((LEVEL_H + 1) * TILE);
    // ...and it must not keep firing on later ticks either.
    for (let i = 0; i < 30; i++) {
      s = tick(s, "-");
      pitTicks += s.events.filter((e) => e === "pit").length;
    }
    expect(pitTicks).toBe(1);
    // blinking means no extra life lost, but you are still put back on the ground
    expect(s.lives).toBe(start.lives);
    expect(solidAt(Math.floor(s.px / TILE), 12)).toBe(true);
  });

  it("respawns clear of a patrolling critter", () => {
    const start = makeState();
    const foe = start.enemies[0];
    const doomed: MarioState = { ...start, px: foe.x, py: foe.y, vy: 0, invuln: 0 };
    const s = tick(doomed, "-");
    expect(s.lives).toBe(start.lives - 1);
    const near = s.enemies.some(
      (e) => e.alive && Math.abs(e.x / TILE - s.px / TILE) < 3 && Math.abs(e.y / TILE - 12) < 2,
    );
    expect(near).toBe(false);
  });

  it("costs a life when a critter hits you from the side", () => {
    const start = makeState();
    const foe = start.enemies[0];
    const beside: MarioState = { ...start, px: foe.x, py: foe.y, vy: 0, invuln: 0 };
    const s = tick(beside, "-");
    expect(s.lives).toBe(start.lives - 1);
    expect(s.enemies[0].alive).toBe(true);
  });

  it("ignores extra hits while you are still blinking", () => {
    const start = makeState();
    const foe = start.enemies[0];
    const hitTwice: MarioState = { ...start, px: foe.x, py: foe.y, vy: 0, invuln: 5 };
    expect(tick(hitTwice, "-").lives).toBe(start.lives);
  });

  it("runs out of lives and ends the round", () => {
    let s = makeState();
    const total = s.lives;
    for (let i = 0; i < total && s.status === "playing"; i++) s = fallFrom(s);
    expect(s.lives).toBe(0);
    expect(s.status).toBe("lost");
  });

  it("wins on reaching the flag and stops simulating", () => {
    const start = makeState();
    const atFlag: MarioState = { ...start, px: GOAL_X * TILE + 4, py: 12 * TILE - PLAYER_H };
    const s = tick(atFlag, "-");
    expect(s.status).toBe("won");
    expect(s.score).toBeGreaterThan(0);
    const after = tick(s, "rrrrrrrrrr");
    expect(after).toBe(s);
  });

  it("is winnable — a plain right-and-jump run reaches the flag", () => {
    const s = autopilot();
    expect(s.status).toBe("won");
    expect(s.px).toBeGreaterThanOrEqual(GOAL_X * TILE - TILE);
  });

  it("caps how long a stall can run for", () => {
    const s = idle(makeState(), 99);
    expect(s.tick).toBeLessThanOrEqual(300);
  });
});

describe("mario core — read-outs", () => {
  it("keeps the camera inside the level", () => {
    expect(cameraX(makeState())).toBe(0);
    const far = { ...makeState(), px: (LEVEL_W - 1) * TILE };
    expect(cameraX(far)).toBe(LEVEL_W * TILE - 21 * TILE);
  });

  it("reports progress along the level", () => {
    const start = makeState();
    // the run begins a few tiles in, so progress starts just above zero
    expect(progress(start)).toBeGreaterThan(0);
    expect(progress(start)).toBeLessThan(0.05);
    expect(progress({ ...start, px: GOAL_X * TILE })).toBeCloseTo(1);
    expect(progress({ ...start, px: GOAL_X * TILE * 2 })).toBe(1); // clamped
  });

  it("draws the player into the text view", () => {
    const art = renderWorld(makeState());
    expect(art).toContain("@");
    expect(art.split("\n")).toHaveLength(15);
  });

  it("counts every coin on the level", () => {
    const s = makeState();
    expect(coinsTotal(s)).toBe(s.coins.filter((c) => !c.got).length + s.coinsGot);
    expect(coinsTotal(s)).toBeGreaterThan(10);
  });

  it("summarises a batch of events into one line", () => {
    expect(summarize([])).toBe("");
    expect(summarize(["coin", "coin"])).toContain("+20");
    expect(summarize(["stomp"])).toContain("Stomped");
    expect(summarize(["hurt"])).toContain("Ouch");
    expect(summarize(["win"])).toContain("flag");
  });
});

describe("mario engine — input parsing", () => {
  it("reads the chat verbs", () => {
    expect(inputFor("go right")).toBe("r".repeat(60));
    expect(inputFor("go left")).toBe("l".repeat(60));
    expect(inputFor("jump")).toBe("j".repeat(16));
    expect(inputFor("stop")).toBe("-".repeat(12));
  });

  it("builds a running jump out of two verbs", () => {
    const hop = inputFor("hop right");
    expect(hop.endsWith("R")).toBe(true);
    expect(hop.startsWith("r")).toBe(true);
  });

  it("passes a canvas batch straight through, case intact", () => {
    expect(inputFor("go rr-RR")).toBe("rr-RR");
    expect(inputFor("go RRRR")).toBe("RRRR");
  });

  it("does not mistake the word 'right' for raw input", () => {
    // Regression: `go right` used to be read as five input characters, only one
    // of which ('r') was legal — so typing "go right" moved you one tick.
    expect(inputFor("go right")).not.toContain("i");
    expect(inputFor("go right")).toBe("r".repeat(60));
  });

  it("ignores anything it cannot play", () => {
    expect(inputFor("banana")).toBe("");
    expect(inputFor("")).toBe("");
    expect(inputFor("go right please")).toBe("");
  });
});

describe("mario engine", () => {
  it("seeds a playable round", () => {
    const s = mario.seed();
    expect(s.status).toBe("playing");
    expect(s.lives).toBe(5);
    expect(s.coinsTotal).toBeGreaterThan(0);
    expect(s.levelW).toBeGreaterThan(0);
  });

  it("advances the world and narrates it in plain words for the chat", () => {
    const r = mario.step(mario.seed(), "go right");
    expect(r.state.tick).toBe(60);
    expect(r.reply).toMatch(/coins/);
    // Regression: the chat reply used to be an ASCII map. The world is drawn
    // on a canvas — dropping `#####^@###` underneath it read as a terminal.
    expect(r.reply).not.toContain("@");
    expect(r.reply).not.toContain("###");
  });

  it("still prints the map when someone actually asks for it", () => {
    const reply = mario.step(mario.seed(), "look").reply ?? "";
    expect(reply).toContain("@");
    expect(reply.split("\n").length).toBeGreaterThan(15);
  });

  it("returns only a note in quiet mode, for the canvas toast", () => {
    const r = mario.step(mario.seed(), "go right", { quiet: true });
    expect(r.reply).toBeUndefined();
    expect(typeof r.note).toBe("string");
  });

  it("keeps the world still and says so when it cannot parse a move", () => {
    const s = mario.seed();
    const r = mario.step(s, "banana");
    expect(r.state.tick).toBe(0);
    expect(r.reply).toContain("go right");
    const q = mario.step(s, "banana", { quiet: true });
    expect(q.note).toBeTruthy();
  });

  it("answers `help` without moving", () => {
    const s = mario.seed();
    const r = mario.step(s, "help");
    expect(r.state.tick).toBe(0);
    expect(r.reply).toContain("hop right");
  });

  it("never advances more than MAX_TICKS in one call", () => {
    const r = mario.step(mario.seed(), `go ${"r".repeat(MAX_TICKS * 4)}`);
    expect(r.state.tick).toBeLessThanOrEqual(MAX_TICKS);
  });

  it("never asks the model for anything", () => {
    expect(mario.step(mario.seed(), "go right").needsLlm).toBeFalsy();
  });

  it("seeds the level the client asked for", () => {
    const s = mario.seed({ level: 2 });
    expect(s.level).toBe(2);
    expect(s.levelId).toBe(LEVEL_SPECS[2].id);
    expect(s.lives).toBe(LEVEL_SPECS[2].lives);
    expect(mario.intro(s)).toContain(LEVEL_SPECS[2].id);
    // a level number off the wire must not blow up a round
    expect(mario.seed({ level: 999 }).level).toBe(LEVEL_SPECS.length - 1);
    expect(mario.seed({ level: "nonsense" }).level).toBe(0);
  });

  it("lists the levels and jumps to one on request", () => {
    const s = mario.seed();
    const list = mario.step(s, "levels").reply ?? "";
    for (const l of LEVEL_SPECS) expect(list).toContain(l.id);

    // by number...
    const byNo = mario.step(s, "level 3");
    expect(byNo.state.level).toBe(2);
    expect(byNo.state.status).toBe("playing");
    expect(byNo.state.lives).toBe(LEVEL_SPECS[2].lives);
    expect(byNo.state.coinsTotal).toBeGreaterThan(0);
    expect(byNo.reply).toContain(LEVEL_SPECS[2].name);

    // ...and by name, which matters because `go 2-1` looks like raw input.
    expect(mario.step(s, "level 1-1").state.level).toBe(0);
    expect(mario.step(s, "level 3-1").state.levelId).toBe("3-1");
    const bad = mario.step(s, "level 9-9").state;
    expect(bad.level).toBe(s.level); // unchanged, and it says so
    expect(mario.step(s, "level 9-9").reply).toContain("levels");
  });

  it("can be played start to finish on a late level through the engine alone", () => {
    const last = LEVEL_SPECS.length - 1;
    let s = mario.seed({ level: last });
    let hold = 0;
    for (let i = 0; i < 60 * 150 && s.status === "playing"; i++) {
      const bodyY = Math.floor((s.py + 7) / TILE);
      const footY = Math.floor((s.py + 18) / TILE);
      let want = false;
      for (let d = 22; d <= 34; d += 6) {
        const tx = Math.floor((s.px + d) / TILE);
        if (!solidAt(tx, footY, s.level) && !solidAt(tx + 1, footY, s.level)) want = true;
        if (solidAt(tx, bodyY, s.level) || solidAt(tx + 1, bodyY, s.level)) want = true;
      }
      if (s.enemies.some((e) => e.alive && e.x > s.px - 6 && e.x - s.px < 30 && Math.abs(e.y - s.py) < 24)) {
        want = true;
      }
      if (s.onGround && want) hold = 16;
      const jump = hold > 0;
      if (hold > 0) hold -= 1;
      s = mario.step(s, `go ${encodeInput({ right: true, jump })}`, { quiet: true }).state;
    }
    expect(s.status).toBe("won");
  });

  it("keeps responding after the round is over", () => {
    const won = { ...mario.seed(), status: "won" as const };
    const r = mario.step(won, "go right");
    expect(r.state.tick).toBe(0);
    expect(r.reply).toContain("flag");
  });

  it("can be played start to finish through the engine alone", () => {
    // Drive the whole level through the HTTP-facing verb path, one batch of
    // ticks per call, exactly as the canvas does.
    let s = mario.seed();
    let hold = 0;
    for (let i = 0; i < 60 * 150 && s.status === "playing"; i++) {
      const bodyY = Math.floor((s.py + 7) / TILE);
      const footY = Math.floor((s.py + 18) / TILE);
      let want = false;
      for (let d = 22; d <= 34; d += 6) {
        const tx = Math.floor((s.px + d) / TILE);
        if (!solidAt(tx, footY) && !solidAt(tx + 1, footY)) want = true;
        if (solidAt(tx, bodyY) || solidAt(tx + 1, bodyY)) want = true;
      }
      if (s.enemies.some((e) => e.alive && e.x > s.px - 6 && e.x - s.px < 30 && Math.abs(e.y - s.py) < 24)) {
        want = true;
      }
      if (s.onGround && want) hold = 16;
      const jump = hold > 0;
      if (hold > 0) hold -= 1;
      s = mario.step(s, `go ${encodeInput({ right: true, jump })}`, { quiet: true }).state;
    }
    expect(s.status).toBe("won");
  });
});
