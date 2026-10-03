// Deterministic platformer physics for "Super Hop".
//
// This module is the single source of truth for how the game behaves. The
// server engine (server/mario.mjs) and the canvas client (src/components/
// MarioGame.tsx) both import and run these exact functions, so the client can
// predict every frame at 60fps while the server stays authoritative — the two
// can never drift, because there is only one implementation.
//
// Two rules keep it honest:
//   1. No Date.now(), no Math.random(). Same state + same input => same output,
//      on any machine, in any order.
//   2. `tick` never mutates its argument. It returns a new state, so a client
//      can rewind to any earlier tick without corrupting anything.

/** Simulation rate. One tick = 1/60th of a second. */
export const TICK_HZ = 60;

/** Everything is drawn on a 16px tile grid. */
export const TILE = 16;

/** The camera shows this many tiles. */
export const VIEW_W = 21;
export const VIEW_H = 15;

export const LEVEL_W = 160;
export const LEVEL_H = 15;

/** Row where solid ground starts. */
const GROUND_TOP = 12;

/** Player and enemy hitboxes — slightly smaller than a tile so gaps feel fair. */
export const PLAYER_W = 10;
export const PLAYER_H = 14;
export const ENEMY_W = 14;
export const ENEMY_H = 14;

/** Tuned by feel, in pixels-per-tick and pixels-per-tick². */
export const PHYS = {
  gravity: 0.42,
  accel: 0.55,
  maxRun: 3.1,
  friction: 0.38,
  jump: -7.6,
  /**
   * Releasing jump early clips upward speed, which is what makes jump height
   * variable. Deliberately not a hard stop: even the quickest tap has to clear
   * a fence, or small hands get stranded on the first block.
   */
  jumpCut: -4.6,
  /** Ticks after walking off a ledge where you can still jump (coyote time). */
  coyoteTicks: 6,
  /** Ticks a jump press is remembered while you're still falling (jump buffer). */
  bufferTicks: 6,
  /**
   * Grounded ticks before a still-held jump button arms another hop.
   *
   * Without this, jumping fires only on the button's rising edge — so a child
   * who holds jump gets exactly one leap and is then stuck against a pipe
   * forever, with nothing on screen to say why. Holding now keeps you hopping.
   */
  rearmTicks: 8,
  /** Bounce you get for stomping an enemy. */
  stompBounce: -5.2,
  maxFall: 12,
  enemySpeed: 0.45,
};

/** Ticks of blinking invulnerability after a hit, so you don't die twice at once. */
export const INVULN_TICKS = 90;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * One tick of player input, packed into a single character so a whole second
 * of play is 60 bytes. Uppercase means "moving and jumping at the same time".
 *
 *   -   nothing      l   run left     r   run right
 *   j   jump         L   left + jump  R   right + jump
 */
export const INPUT_CHARS = "-lrjLR";
export const IDLE_INPUT = "-";

/** Pack the currently-held controls into one input character. */
export function encodeInput({ left, right, jump }) {
  const move = left && !right ? "l" : right && !left ? "r" : "";
  if (move && jump) return move.toUpperCase();
  if (move) return move;
  return jump ? "j" : IDLE_INPUT;
}

/** Split an input string into single characters, dropping anything unknown. */
export function decodeInput(input) {
  const out = [];
  for (const ch of String(input ?? "")) if (INPUT_CHARS.includes(ch)) out.push(ch);
  return out;
}

// ---------------------------------------------------------------------------
// Level
// ---------------------------------------------------------------------------

/**
 * Terrain characters:
 *   .  empty       #  ground (solid)       =  wooden ledge (solid)
 *   P  warp pipe (solid)                    Q  block (solid)
 *   B  bush (pure decoration, walk-through) o  coin
 *   ^  critter spawn                        F  goal flag
 * The start position is fixed rather than stamped into the grid.
 */
export const GOAL_X = LEVEL_W - 5;
const SPAWN_X = 3;
const SPAWN_Y = () => GROUND_TOP * TILE - PLAYER_H;

/** Tiles of clear run you need before a pit to line the jump up. */
const RUN_UP = 6;

/**
 * Make an authored spec playable before anyone walks into it.
 *
 * A pipe is a wall you have to hop, and hopping it is only fair when you can
 * see it coming and land on something afterwards. Five things break that, and
 * all five were found by the bot in `tests/mario.test.ts`:
 *
 *   1. a ledge hanging over the pipe — you jump, thump your head, and drop
 *      straight into whatever was waiting behind it;
 *   2. a pipe at the lip of a pit, so there is no runway to gather speed;
 *   3. a pipe over thin ground, so there is nowhere to land;
 *   4. a ledge standing in the run-up to a pit, for the same bonk-at-the-worst-
 *      moment reason as (1);
 *   5. a critter loitering in that same run-up, because dodging it eats the
 *      jump you needed for the gap behind it.
 *
 * So the offending ledges and critters go, then any pipe that still cannot be
 * taken on fairly is dropped. Authors write the level they want; this is where
 * it becomes a level a child can actually finish.
 */
function sanitizeSpec(spec) {
  const inPit = (x) => spec.pits.some(([a, b]) => x >= a && x <= b);
  const groundAt = (x) => x >= 0 && x < LEVEL_W && !inPit(x);
  // A pipe standing on the floor with nothing solid within a jump of it, and not
    // itself standing in the run-up to a gap a few tiles further on.
  const fair = (x) => {
    if (x < 4 || x + 4 >= LEVEL_W) return false;
    if (!groundAt(x) || !groundAt(x + 1)) return false;
    for (let d = 2; d <= 4; d++) if (!groundAt(x + d)) return false; // room to land
    for (let d = -3; d <= -1; d++) if (!groundAt(x + d)) return false; // room to run up
    if (spec.pits.some(([lo]) => lo >= x - 1 && lo <= x + RUN_UP + 1)) return false;
    return spec.platforms.every(([px, , w]) => px > x + 2 || px + w - 1 < x - 1);
  };
  const pipes = spec.pipes.filter(([x]) => fair(x));
  /** Columns where anything overhead ruins a jump: over a pipe, or in a run-up. */
  const roofed = (a, b) => {
    for (let x = a; x <= b; x++) {
      if (pipes.some(([px]) => x >= px - 1 && x <= px + 2)) return true;
      if (spec.pits.some(([lo]) => x >= lo - RUN_UP && x <= lo - 1)) return true;
    }
    return false;
  };
  return {
    ...spec,
    pipes,
    platforms: spec.platforms.filter(([a, , w]) => !roofed(a, a + w - 1)),
    blocks: spec.blocks.filter(([a, , w]) => !roofed(a, a + w - 1)),
    enemies: spec.enemies.filter((x) => !roofed(x - 1, x + 1)),
  };
}

function buildLevel(spec) {
  const grid = [];
  for (let y = 0; y < LEVEL_H; y++) grid.push(new Array(LEVEL_W).fill("."));

  const set = (x, y, c) => {
    if (x >= 0 && x < LEVEL_W && y >= 0 && y < LEVEL_H) grid[y][x] = c;
  };
  const rect = (x0, y0, w, h, c) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c);
  };

  rect(0, GROUND_TOP, LEVEL_W, LEVEL_H - GROUND_TOP, "#");
  for (const [a, b] of spec.pits) rect(a, GROUND_TOP, b - a + 1, LEVEL_H - GROUND_TOP, ".");
  for (const [x, y, w] of spec.platforms) rect(x, y, w, 1, "=");
  for (const [x, h] of spec.pipes) rect(x, GROUND_TOP - h, 2, h, "P");
  for (const [x, y, n] of spec.blocks) for (let i = 0; i < n; i++) set(x + i, y, "Q");

  // Critters last, but never on top of something solid — a spawn buried in a
  // pipe would wander inside it forever — and never over a hole: there they
  // would stand frozen on the lip forever, daring you into a jump you cannot
  // time from that distance.
  for (const x of spec.enemies) {
    if (isSolidTile(grid[GROUND_TOP - 1]?.[x] ?? ".")) continue;
    if (!isSolidTile(grid[GROUND_TOP]?.[x] ?? ".")) continue;
    set(x, GROUND_TOP - 1, "^");
  }
  for (const [x, y, n] of spec.coins) for (let i = 0; i < n; i++) set(x + i * 2, y, "o");
  for (const x of spec.bushes) {
    if (grid[GROUND_TOP - 1]?.[x] && grid[GROUND_TOP - 1][x] !== " ") continue;
    set(x, GROUND_TOP - 1, "B");
  }
  set(GOAL_X, GROUND_TOP - 3, "F");

  return grid.map((r) => r.join(""));
}

/**
 * The level select.
 *
 * Each level escalates: more gaps, more critters, more pipes, and the gaps get
 * wider up to three tiles — the most a running jump clears with room to spare.
 * `tests/mario.test.ts` pilots a bot down every one of them, because a level
 * that looks fine but cannot be finished is worse than no level at all.
 */
const AUTHORED_LEVELS = [
  {
    id: "1-1",
    name: "Green Hills",
    blurb: "Wide open ground. Learn to run and hop.",
    lives: 5,
    pits: [
      [25, 26],
      [46, 48],
      [70, 72],
      [96, 98],
      [122, 124],
      [144, 146],
    ],
    platforms: [
      [12, 9, 4],
      [16, 7, 3],
      [31, 8, 5],
      [33, 6, 3],
      [54, 9, 4],
      [55, 7, 3],
      [78, 8, 4],
      [82, 6, 4],
      [103, 9, 5],
      [112, 7, 3],
      [130, 8, 4],
      [135, 6, 3],
      [150, 9, 4],
    ],
    pipes: [
      [6, 2],
      [38, 2],
      [62, 2],
      [109, 2],
      [139, 2],
    ],
    blocks: [
      [36, 7, 3],
      [58, 6, 4],
      [86, 7, 3],
      [126, 6, 4],
    ],
    enemies: [31, 42, 58, 66, 82, 92, 105, 118, 135, 152],
    coins: [
      [10, 5, 4],
      [20, 4, 3],
      [32, 6, 4],
      [56, 5, 4],
      [79, 5, 3],
      [104, 6, 4],
      [131, 5, 3],
      [25, 9, 2],
      [47, 9, 3],
      [71, 9, 2],
      [97, 9, 2],
      [123, 9, 3],
    ],
    bushes: [8, 28, 42, 60, 74, 100, 118, 142],
  },
  {
    id: "1-2",
    name: "Brick Bridge",
    blurb: "Tighter gaps and pipes to hop over.",
    lives: 5,
    pits: [
      [24, 26],
      [42, 44],
      [64, 66],
      [88, 90],
      [114, 116],
      [138, 140],
    ],
    platforms: [
      [11, 9, 4],
      [15, 7, 3],
      [30, 8, 5],
      [45, 6, 3],
      [52, 9, 4],
      [67, 7, 4],
      [75, 8, 4],
      [91, 6, 4],
      [100, 9, 5],
      [105, 7, 3],
      [128, 8, 4],
      [141, 6, 3],
      [148, 9, 4],
    ],
    pipes: [
      [6, 2],
      [49, 2],
      [82, 2],
      [121, 2],
      [153, 2],
    ],
    blocks: [
      [32, 7, 4],
      [54, 6, 4],
      [78, 7, 4],
      [124, 6, 4],
    ],
    enemies: [30, 39, 55, 62, 79, 86, 104, 116, 132, 150],
    coins: [
      [9, 5, 4],
      [22, 4, 3],
      [30, 6, 4],
      [52, 5, 4],
      [76, 5, 3],
      [100, 6, 4],
      [128, 5, 3],
      [24, 9, 2],
      [42, 9, 3],
      [64, 9, 2],
      [88, 9, 3],
      [114, 9, 3],
      [138, 9, 3],
    ],
    bushes: [7, 26, 40, 58, 74, 96, 118, 140],
  },
  {
    id: "1-3",
    name: "Pipe Garden",
    blurb: "Pipes everywhere. Mind the critters.",
    lives: 5,
    pits: [
      [28, 30],
      [48, 50],
      [70, 72],
      [92, 94],
      [116, 118],
      [140, 142],
    ],
    platforms: [
      [13, 9, 4],
      [19, 7, 3],
      [33, 8, 4],
      [39, 6, 3],
      [55, 9, 4],
      [57, 7, 3],
      [79, 8, 5],
      [104, 9, 5],
      [119, 7, 3],
      [130, 8, 4],
      [143, 6, 3],
      [150, 9, 4],
    ],
    pipes: [
      [8, 2],
      [43, 2],
      [87, 2],
      [111, 2],
      [155, 2],
    ],
    blocks: [
      [35, 7, 4],
      [60, 6, 4],
      [82, 7, 4],
      [128, 6, 4],
    ],
    enemies: [26, 38, 54, 63, 77, 91, 103, 118, 133, 147],
    coins: [
      [11, 5, 4],
      [20, 4, 3],
      [34, 6, 4],
      [56, 5, 4],
      [80, 5, 3],
      [105, 6, 4],
      [131, 5, 3],
      [28, 9, 2],
      [48, 9, 3],
      [70, 9, 2],
      [92, 9, 3],
      [116, 9, 3],
      [140, 9, 3],
    ],
    bushes: [9, 24, 40, 56, 72, 96, 120, 138],
  },
  {
    id: "2-1",
    name: "High Rise",
    blurb: "Long jumps over the hills.",
    lives: 4,
    pits: [
      [22, 24],
      [44, 46],
      [66, 68],
      [88, 90],
      [110, 112],
      [132, 134],
      [150, 152],
    ],
    platforms: [
      [10, 9, 4],
      [25, 8, 3],
      [26, 7, 3],
      [50, 9, 4],
      [57, 8, 3],
      [74, 7, 4],
      [92, 6, 4],
      [99, 9, 5],
      [114, 8, 3],
      [118, 7, 4],
      [136, 9, 4],
      [141, 8, 3],
    ],
    pipes: [
      [6, 2],
      [16, 2],
      [32, 2],
      [83, 2],
      [127, 2],
    ],
    blocks: [
      [33, 7, 4],
      [54, 6, 4],
      [78, 7, 4],
      [100, 6, 4],
      [122, 7, 4],
    ],
    enemies: [24, 38, 52, 64, 80, 94, 108, 124, 138, 148],
    coins: [
      [8, 5, 4],
      [18, 6, 3],
      [26, 5, 4],
      [50, 5, 4],
      [74, 5, 4],
      [100, 6, 4],
      [122, 5, 4],
      [136, 6, 3],
      [22, 9, 3],
      [44, 9, 3],
      [66, 9, 3],
      [88, 9, 3],
      [110, 9, 3],
      [132, 9, 3],
    ],
    bushes: [7, 20, 36, 52, 68, 90, 106, 122, 142],
  },
  {
    id: "2-2",
    name: "Coin Canyon",
    blurb: "Greedy ground, bigger stacks of coins.",
    lives: 4,
    pits: [
      [20, 22],
      [40, 42],
      [60, 62],
      [80, 82],
      [100, 102],
      [120, 122],
      [140, 142],
    ],
    platforms: [
      [9, 9, 5],
      [23, 7, 4],
      [26, 8, 4],
      [46, 9, 5],
      [66, 8, 4],
      [86, 9, 5],
      [106, 8, 4],
      [126, 9, 5],
      [146, 8, 4],
    ],
    pipes: [
      [6, 2],
      [52, 2],
      [93, 2],
      [112, 2],
      [152, 2],
    ],
    blocks: [
      [28, 7, 4],
      [49, 6, 5],
      [68, 7, 4],
      [89, 6, 5],
      [106, 7, 4],
      [129, 6, 5],
    ],
    enemies: [22, 34, 44, 56, 68, 78, 90, 102, 118, 132, 146],
    coins: [
      [8, 5, 5],
      [17, 4, 4],
      [26, 6, 5],
      [46, 5, 5],
      [54, 4, 4],
      [66, 6, 5],
      [86, 5, 5],
      [94, 4, 4],
      [106, 6, 5],
      [126, 5, 5],
      [134, 4, 4],
      [146, 6, 5],
      [20, 9, 3],
      [40, 9, 3],
      [60, 9, 3],
      [80, 9, 3],
      [100, 9, 3],
      [120, 9, 3],
      [140, 9, 3],
    ],
    bushes: [6, 18, 34, 50, 66, 82, 98, 114, 130, 148],
  },
  {
    id: "3-1",
    name: "The Gauntlet",
    blurb: "Everything at once. Good luck!",
    lives: 4,
    pits: [
      [18, 20],
      [34, 36],
      [50, 52],
      [66, 68],
      [82, 84],
      [98, 100],
      [114, 116],
      [130, 132],
      [146, 148],
    ],
    platforms: [
      [8, 9, 4],
      [21, 7, 3],
      [24, 8, 4],
      [37, 6, 3],
      [40, 9, 4],
      [69, 8, 4],
      [88, 9, 4],
      [104, 7, 4],
      [120, 8, 4],
      [149, 9, 4],
    ],
    pipes: [
      [5, 2],
      [29, 2],
      [76, 2],
      [93, 2],
      [137, 2],
    ],
    blocks: [
      [24, 7, 4],
      [53, 6, 4],
      [70, 7, 4],
      [88, 6, 4],
      [118, 7, 4],
      [136, 6, 4],
    ],
    enemies: [20, 26, 40, 46, 58, 72, 88, 104, 112, 128, 142, 152],
    coins: [
      [8, 5, 4],
      [24, 6, 4],
      [42, 5, 4],
      [64, 6, 4],
      [92, 5, 4],
      [122, 6, 4],
      [144, 5, 4],
      [18, 9, 2],
      [34, 9, 2],
      [50, 9, 2],
      [66, 9, 2],
      [82, 9, 2],
      [98, 9, 2],
      [114, 9, 2],
      [130, 9, 2],
      [146, 9, 2],
    ],
    bushes: [5, 22, 38, 54, 70, 86, 102, 118, 134, 150],
  },
];

/** The level select, as authored but with every unfair pipe taken out. */
export const LEVEL_SPECS = AUTHORED_LEVELS.map(sanitizeSpec);

/** Immutable terrain for every level; the rows never change during a round. */
export const LEVELS = LEVEL_SPECS.map(buildLevel);

/** The first level, kept as the default so older callers keep working. */
export const LEVEL = LEVELS[0];

/** Tiles that block movement. Bushes and coins are decoration you pass through. */
export function isSolidTile(ch) {
  return ch === "#" || ch === "=" || ch === "P" || ch === "Q";
}

/**
 * Terrain rows for a level index, clamped the same way `makeState` clamps it —
 * a canvas asking for level 99 has to get the last level, not the first, or it
 * draws one world while the server is running another.
 */
export function levelTiles(level = 0) {
  return LEVELS[pickLevel(level)];
}

/** Is there something solid at this tile? Outside the sides is a wall, below is the void. */
export function solidAt(px, py, level = 0) {
  if (px < 0 || px >= LEVEL_W) return true;
  if (py < 0) return false;
  if (py >= LEVEL_H) return false;
  return isSolidTile(levelTiles(level)[py][px]);
}

function overlapsSolid(b, level) {
  const x0 = Math.floor(b.x / TILE);
  const x1 = Math.floor((b.x + b.w - 0.001) / TILE);
  const y0 = Math.floor(b.y / TILE);
  const y1 = Math.floor((b.y + b.h - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (solidAt(tx, ty, level)) return true;
    }
  }
  return false;
}

/**
 * Move a box, never further than 4px at a time so it can't tunnel through a
 * thin platform, and never further than it fits.
 */
function sweep(b, dx, dy, level) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
  const sx = dx / steps;
  const sy = dy / steps;
  let hitX = false;
  let hitY = false;
  for (let i = 0; i < steps; i++) {
    if (sx) {
      b.x += sx;
      if (overlapsSolid(b, level)) {
        b.x -= sx;
        hitX = true;
      }
    }
    if (sy) {
      b.y += sy;
      if (overlapsSolid(b, level)) {
        b.y -= sy;
        hitY = true;
      }
    }
  }
  return { hitX, hitY };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function collectSpawns(level) {
  const coins = [];
  const enemies = [];
  const tiles = levelTiles(level);
  for (let y = 0; y < LEVEL_H; y++) {
    for (let x = 0; x < LEVEL_W; x++) {
      const ch = tiles[y][x];
      if (ch === "o") coins.push({ x, y, got: false });
      else if (ch === "^") enemies.push({ x: x * TILE + 1, y: y * TILE, vx: -PHYS.enemySpeed, alive: true });
    }
  }
  return { coins, enemies };
}

/** Clamp anything — a bad level number from the wire must not crash a round. */
function pickLevel(n) {
  const i = Number.isFinite(n) ? Math.trunc(Number(n)) : 0;
  return Math.max(0, Math.min(LEVELS.length - 1, i));
}

/** A fresh round on the given level (0-based). */
export function makeState(opts = {}) {
  const level = pickLevel(opts?.level);
  const spec = LEVEL_SPECS[level];
  const { coins, enemies } = collectSpawns(level);
  const px = SPAWN_X * TILE;
  const py = SPAWN_Y();
  return {
    level,
    levelId: spec.id,
    levelName: spec.name,
    levelCount: LEVELS.length,
    px,
    py,
    vx: 0,
    vy: 0,
    face: 1,
    onGround: true,
    jPrev: false,
    /** Ticks spent standing on something — used to re-arm a held jump. */
    onGroundFor: 0,
    /** Game-feel counters, all in ticks. */
    coyote: PHYS.coyoteTicks,
    buffer: 0,
    invuln: 0,
    coins,
    enemies,
    coinsGot: 0,
    score: 0,
    /** Each level is a shade tougher; the early ones stay generous for small hands. */
    lives: spec.lives ?? 5,
    tick: 0,
    furthest: px,
    status: "playing",
    /** Per-tick happenings the client turns into particles and toasts. */
    events: [],
  };
}

/**
 * Where to put you back after a hit.
 *
 * Walks left from where you fell looking for solid ground that has a few tiles
 * of runway after it, so you can never respawn balanced on the lip of a pit and
 * fall straight back in. It also skips anywhere a live critter is loitering —
 * otherwise you respawn, blink for a second and a half, and walk straight into
 * the same one, which turns a single mistake into an unwinnable loop.
 *
 * The tile above the floor has to be clear too: standing still, the player's
 * body lives entirely in that one row, so landing on a column with a pipe in it
 * would wedge them inside the pipe with no way left or right.
 */
function respawnPoint(s) {
  const from = Math.floor(s.px / TILE);
  const clearOfCritters = (tx) =>
    !s.enemies.some(
      (e) => e.alive && Math.abs(e.x / TILE - tx) < 3 && Math.abs(e.y / TILE - GROUND_TOP) < 2,
    );
  for (let tx = from; tx > 0; tx--) {
    if (!solidAt(tx, GROUND_TOP, s.level) || !solidAt(tx + 1, GROUND_TOP, s.level) || !solidAt(tx + 2, GROUND_TOP, s.level)) continue;
    if (solidAt(tx, GROUND_TOP - 1, s.level) || solidAt(tx + 1, GROUND_TOP - 1, s.level)) continue;
    if (!clearOfCritters(tx) || !clearOfCritters(tx + 2)) continue;
    return { x: tx * TILE, y: SPAWN_Y() };
  }
  return { x: SPAWN_X * TILE, y: SPAWN_Y() };
}

/** Put the player back on solid ground and start the blink. */
function placeAt(s, pt) {
  s.px = pt.x;
  s.py = pt.y;
  s.vx = 0;
  s.vy = 0;
  s.onGround = true;
  s.coyote = PHYS.coyoteTicks;
  s.buffer = 0;
  s.invuln = INVULN_TICKS;
}

/** A critter got you. Ignored entirely while you're still blinking. */
function hurt(s) {
  if (s.invuln > 0) return;
  s.lives -= 1;
  s.events.push("hurt");
  if (s.lives <= 0) {
    s.status = "lost";
    s.vx = 0;
    s.vy = 0;
    return;
  }
  placeAt(s, respawnPoint(s));
  s.events.push("respawn");
}

/**
 * You fell out of the world.
 *
 * Unlike a critter hit, this *always* puts you back — the life is optional, not
 * the rescue. Skipping the rescue while blinking left the player below the
 * level forever, emitting a fresh "pit" event every tick and wedging the game.
 */
function fellInPit(s) {
  s.events.push("pit");
  if (s.invuln <= 0) {
    s.lives -= 1;
    s.events.push("hurt");
  }
  if (s.lives <= 0) {
    s.status = "lost";
    s.vx = 0;
    s.vy = 0;
    return;
  }
  placeAt(s, respawnPoint(s));
  s.events.push("respawn");
}

/**
 * Advance the world by one tick.
 *
 * @param {object} prev   the current state (never mutated)
 * @param {string} ch     one input character, see INPUT_CHARS
 * @returns {object} the next state
 */
export function tick(prev, ch) {
  if (!prev || prev.status !== "playing") return prev;

  // Copy-on-write: nothing above us can see these edits.
  const s = {
    ...prev,
    coins: prev.coins.map((c) => (c.got ? c : { ...c })),
    enemies: prev.enemies.map((e) => ({ ...e })),
    events: [],
  };
  s.tick = prev.tick + 1;
  if (s.invuln > 0) s.invuln -= 1;
  s.onGroundFor = prev.onGround ? prev.onGroundFor + 1 : 0;

  const move = ch === "l" || ch === "L" ? -1 : ch === "r" || ch === "R" ? 1 : 0;
  const jumpHeld = ch === "j" || ch === "J" || ch === "L" || ch === "R";

  // --- horizontal ---------------------------------------------------------
  if (move) {
    s.vx = clamp(s.vx + move * PHYS.accel, -PHYS.maxRun, PHYS.maxRun);
    s.face = move;
  } else if (s.vx > 0) s.vx = Math.max(0, s.vx - PHYS.friction);
  else if (s.vx < 0) s.vx = Math.min(0, s.vx + PHYS.friction);

  // --- vertical -----------------------------------------------------------
  s.vy = Math.min(PHYS.maxFall, s.vy + PHYS.gravity);

  // Remember a jump pressed slightly early so it fires the instant you land.
  // A button still held after we've been grounded a moment arms another hop.
  if (jumpHeld) {
    if (!s.jPrev) s.buffer = PHYS.bufferTicks;
    else if (s.onGroundFor >= PHYS.rearmTicks) s.buffer = PHYS.bufferTicks;
  } else if (s.buffer > 0) {
    s.buffer -= 1;
  }

  // Coyote time: forgive stepping off a ledge a frame before you jumped.
  if (s.onGround) s.coyote = PHYS.coyoteTicks;
  else if (s.coyote > 0) s.coyote -= 1;

  if (s.buffer > 0 && s.coyote > 0) {
    s.vy = PHYS.jump;
    s.onGround = false;
    s.coyote = 0;
    s.buffer = 0;
    s.events.push("jump");
  }
  if (!jumpHeld && s.vy < PHYS.jumpCut) s.vy = PHYS.jumpCut;
  s.jPrev = jumpHeld;

  // --- move ---------------------------------------------------------------
  const box = { x: s.px, y: s.py, w: PLAYER_W, h: PLAYER_H };
  const wasFalling = s.vy > 0;
  const hit = sweep(box, s.vx, s.vy, s.level);
  if (hit.hitX) s.vx = 0;
  s.px = box.x;
  s.py = box.y;
  s.onGround = hit.hitY && wasFalling;
  if (hit.hitY) s.vy = 0;
  if (s.px > s.furthest) s.furthest = s.px;

  // --- fell in a pit ------------------------------------------------------
  if (s.py > (LEVEL_H + 1) * TILE) {
    fellInPit(s);
    return s;
  }

  // --- coins --------------------------------------------------------------
  for (const c of s.coins) {
    if (c.got) continue;
    if (aabb(s.px, s.py, PLAYER_W, PLAYER_H, c.x * TILE + 2, c.y * TILE + 2, 12, 12)) {
      c.got = true;
      s.coinsGot += 1;
      s.score += 10;
      s.events.push("coin");
    }
  }

  // --- enemies ------------------------------------------------------------
  for (const e of s.enemies) {
    if (!e.alive) continue;
    const nextX = e.x + e.vx;
    const lead = e.vx > 0 ? nextX + ENEMY_W : nextX;
    const tx = Math.floor(lead / TILE);
    const wall = solidAt(tx, Math.floor((e.y + ENEMY_H / 2) / TILE), s.level);
    // Turn around at a wall, and at a ledge — otherwise they walk into pits.
    const ledge = !solidAt(tx, Math.floor((e.y + ENEMY_H + 3) / TILE), s.level);
    if (wall || ledge) e.vx = -e.vx;
    else e.x = nextX;

    if (!aabb(s.px, s.py, PLAYER_W, PLAYER_H, e.x, e.y, ENEMY_W, ENEMY_H)) continue;
    const feet = s.py + PLAYER_H;
    if (s.vy > 0.5 && feet - e.y < 9) {
      e.alive = false;
      s.vy = PHYS.stompBounce;
      s.onGround = false;
      s.score += 100;
      s.events.push("stomp");
    } else {
      hurt(s);
    }
  }
  if (s.status !== "playing") return s;

  // --- the flag -----------------------------------------------------------
  if (s.px + PLAYER_W / 2 >= GOAL_X * TILE) {
    s.status = "won";
    s.score += 500 + Math.max(0, s.lives) * 100;
    s.events.push("win");
  }

  return s;
}

/**
 * Run many input characters at once. This is how the server stays in step, and
 * it gathers the events from every tick it replayed (each `tick` starts a fresh
 * `events` array) so the caller can turn a whole batch into one line.
 */
export function advance(state, input) {
  const chars = decodeInput(input);
  const seen = [];
  let s = state;
  for (const ch of chars) {
    if (s.status !== "playing") break;
    s = tick(s, ch);
    if (s.events.length) seen.push(...s.events);
  }
  return chars.length ? { ...s, events: seen } : s;
}

/** Run `seconds` of doing nothing — used to age a level out if a client stalls. */
export function idle(state, seconds) {
  const n = Math.round(Math.min(seconds, 5) * TICK_HZ);
  let s = state;
  for (let i = 0; i < n && s.status === "playing"; i++) s = tick(s, IDLE_INPUT);
  return s;
}

// ---------------------------------------------------------------------------
// Read-outs
// ---------------------------------------------------------------------------

/** Camera x, kept inside the level so you never see past the edges. */
export function cameraX(state) {
  const span = VIEW_W * TILE;
  const max = Math.max(0, LEVEL_W * TILE - span);
  return clamp(Math.round(state.px - span / 2), 0, max);
}

export function coinsTotal(state) {
  return state.coins.length;
}

/** 0..1 along the level — drives the progress bar. */
export function progress(state) {
  return clamp(state.px / (GOAL_X * TILE), 0, 1);
}

/**
 * A plain-text view of the world, for the chat/`gameMove` path and for anyone
 * without the canvas. `cols`/`rows` describe the window to show.
 */
export function renderWorld(state, cols = VIEW_W, rows = VIEW_H) {
  const cam = Math.floor(cameraX(state) / TILE);
  const ptx = Math.floor((state.px - cam * TILE) / TILE);
  const pty = Math.floor((state.py + PLAYER_H / 2) / TILE);
  const tiles = levelTiles(state.level);
  const lines = [];
  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < cols; x++) {
      const gx = cam + x;
      const ch = gx < 0 || gx >= LEVEL_W ? " " : (tiles[y]?.[gx] ?? ".");
      line += x === ptx && y === pty ? "@" : ch === "." ? " " : ch;
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  return lines.join("\n");
}

/**
 * Turn a batch of events into one short line for the toast. The canvas shows
 * this; it never writes to the chat transcript.
 */
export function summarize(events) {
  if (!events || !events.length) return "";
  let coins = 0;
  let stomps = 0;
  let hurt = false;
  let won = false;
  for (const e of events) {
    if (e === "coin") coins++;
    else if (e === "stomp") stomps++;
    else if (e === "hurt" || e === "pit") hurt = true;
    else if (e === "win") won = true;
  }
  const parts = [];
  if (coins) parts.push(`🪙 +${coins * 10}`);
  if (stomps) parts.push(`💥 Stomped ${stomps === 1 ? "a critter" : `${stomps} critters`}! +${stomps * 100}`);
  if (won) return "🏁 You made it to the flag!";
  if (hurt) return "💨 Ouch! Watch out.";
  return parts.join(" ");
}
