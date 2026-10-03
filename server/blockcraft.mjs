// 🧱 Blockcraft — a tiny Minecraft-like voxel world you build block by block.
//
// The world is a side-on cross-section of a voxel world held as a grid of block
// codes. Two front-ends share it: the graphical canvas client (click a block to
// mine it, click air to place, D-pad to walk, hotbar to pick a block) and the
// chat client, which sees the same grid drawn as ASCII. Both drive the exact
// same verbs — `mine at x y`, `place wood at x y`, `move left`, `select glass`.
//
// Everything about terrain, mining, building and blueprint geometry is
// deterministic and local, so the game works fully offline; the LLM is only the
// *architect's voice* — it answers "design me a cosy cabin" with a
// `BUILD 8x4 wood` spec that this engine turns into real blueprint cells,
// which you then fill in block by block (or with `fill`, if you have the
// materials).

export const WORLD_W = 30;
export const WORLD_H = 12;

/** How far (in cells) a GUI player can reach from where they stand. */
export const REACH = 6;

/** Block code → display name (also the inventory key). */
export const BLOCKS = {
  d: "dirt",
  s: "stone",
  w: "wood",
  l: "leaves",
  g: "glass",
  b: "brick",
  c: "coal",
  i: "iron",
};

const LEGEND = "d dirt · s stone · w wood · l leaves · g glass · b brick · c coal · i iron · @ you · + blueprint";

const HELP = `🧱 **Blockcraft commands**\n
• \`mine\` — dig the block you're facing · \`mine up\` / \`mine down\`
• \`place wood\` — build in front of you · \`place wood up\` / \`place wood down\`
• \`place stone at 12 4\` — build at an exact spot
• \`select glass\` — pick the block you'll build with (\`select\` on its own cycles)
• \`jump\` — hop up one block
• \`fill\` — auto-build the blueprint (or a little house) with what you're carrying
• \`move left\` / \`move right\` — walk (and turn to face that way)
• \`blueprint cosy cabin\` — ask Talia to design a structure
• \`help\``;

/** Mirror of the games.mjs status helper, kept local so this module stands alone. */
const won = (s, extra = {}) => ({ ...s, status: "won", ...extra });

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Spoken name → block code. Tolerates "logs", "window", "bricks"… */
const NAME_TO_CODE = {
  d: "d", dirt: "d", soil: "d", mud: "d",
  s: "s", stone: "s", rock: "s", cobble: "s", cobblestone: "s",
  w: "w", wood: "w", log: "w", logs: "w", plank: "w", planks: "w", timber: "w", tree: "w",
  l: "l", leaf: "l", leaves: "l", foliage: "l", canopy: "l",
  g: "g", glass: "g", window: "g", windows: "g",
  b: "b", brick: "b", bricks: "b", block: "b", blocks: "b",
  c: "c", coal: "c",
  i: "i", iron: "i", steel: "i", metal: "i",
};

const MATERIAL_WORDS = {
  wood: "w", logs: "w", planks: "w", timber: "w", tree: "w", wooden: "w",
  stone: "s", rock: "s", cobble: "s", cobblestone: "s", rocky: "s", marble: "s",
  brick: "b", bricks: "b", brickwork: "b",
  glass: "g", windows: "g", window: "g", crystal: "g",
  leaves: "l", leaf: "l", foliage: "l", hedge: "l",
  dirt: "d", earth: "d", soil: "d",
};

export const PLACEABLE = ["d", "s", "w", "l", "g", "b"];

/** Words that steer *where* an action lands, never *what* it places. */
const KEYWORDS = new Set(["at", "up", "down", "left", "right", "above", "below"]);

export function codeFromName(word) {
  return NAME_TO_CODE[norm(word).split(" ")[0]] ?? null;
}

function materialFromWord(word) {
  return MATERIAL_WORDS[norm(word).split(" ")[0]] ?? null;
}

function emptyInv() {
  return Object.fromEntries(Object.keys(BLOCKS).map((k) => [k, 0]));
}

const isSolid = (rows, x, y) => Boolean(rows[y]?.[x]) && rows[y][x] !== " ";
const inBounds = (x, y) => x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H;

// ---------- world generation -------------------------------------------------

function genWorld() {
  const rows = Array.from({ length: WORLD_H }, () => new Array(WORLD_W).fill(" "));
  // Ground sits around row 4-6, leaving sky above and stone below.
  const height = new Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) height[x] = 4 + Math.floor(Math.random() * 3);

  for (let x = 0; x < WORLD_W; x++) {
    const h = height[x];
    for (let y = h; y < WORLD_H; y++) {
      rows[y][x] = y >= WORLD_H - 2 ? "s" : y === h ? "d" : Math.random() < 0.25 ? "d" : "s";
    }
  }

  const ores = 6 + Math.floor(Math.random() * 5);
  for (let i = 0; i < ores; i++) {
    const x = Math.floor(Math.random() * WORLD_W);
    const y = WORLD_H - 3 - Math.floor(Math.random() * 3);
    if (y > 0 && rows[y][x] === "s") rows[y][x] = Math.random() < 0.65 ? "c" : "i";
  }

  // Trees on flat ground, with a leaf canopy.
  for (let x = 3; x < WORLD_W - 4; x++) {
    if (height[x] !== height[x - 1] || height[x] !== height[x + 1]) continue;
    if (Math.random() > 0.18) continue;
    const top = height[x] - 1;
    if (rows[top][x] !== " " || rows[top - 1][x] !== " " || rows[top - 2][x] !== " ") continue;
    const trunk = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let k = 0; k < trunk; k++) rows[top - k][x] = "w";
    const cy = top - trunk;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = 0; dy <= 1; dy++) {
        if (dx === 0 && dy === 1) continue;
        if (rows[cy + dy]?.[x + dx] === " ") rows[cy + dy][x + dx] = "l";
      }
    }
  }

  return { rows, height };
}

/** Row of the first solid block at or below `y` in column `x` (or WORLD_H). */
function groundAt(state, x, y) {
  for (let r = Math.max(0, y); r < WORLD_H; r++) {
    if (isSolid(state.rows, x, r)) return r;
  }
  return WORLD_H;
}

/** Within arm's reach of the player? No limit when `reach` is unset (chat mode). */
function inReach(state, x, y, reach) {
  if (!reach) return true;
  return Math.abs(x - state.px) <= reach && Math.abs(y - state.py) <= reach + 1;
}

// ---------- rendering --------------------------------------------------------

/** Perimeter cells of a w×h rectangle anchored at (x0, y0). */
export function outlineCells(x0, y0, w, h) {
  const cells = [];
  for (let dx = 0; dx < w; dx++) {
    cells.push([x0 + dx, y0]);
    if (h > 1) cells.push([x0 + dx, y0 + h - 1]);
  }
  for (let dy = 1; dy < h - 1; dy++) {
    cells.push([x0, y0 + dy]);
    cells.push([x0 + w - 1, y0 + dy]);
  }
  return cells;
}

export function renderWorld(state) {
  const grid = state.rows.map((r) => [...r]);
  const bp = state.blueprint;
  if (bp) {
    bp.cells.forEach(([x, y], i) => {
      if (!bp.filled[i] && grid[y]?.[x] === " ") grid[y][x] = "+";
    });
  }
  if (inBounds(state.px, state.py)) grid[state.py][state.px] = "@";
  const bar = "─".repeat(WORLD_W);
  return `┌${bar}┐\n${grid.map((r) => `│${r.join("")}│`).join("\n")}\n└${bar}┘`;
}

/**
 * Pull the short human line out of a `view()` reply: drop the framed world and
 * the legend, keep the status line and the note. The GUI client shows this as a
 * one-line toast instead of dumping ASCII into a chat bubble.
 */
export function extractNote(reply) {
  return String(reply ?? "")
    .split("\n")
    .map((l) => l.trim())
    // The framed world, the legend and the `📍 …` status line are all drawn by
    // the canvas client already, so they never become the toast.
    .filter((l) => l && !/[┌│└]/.test(l) && !l.startsWith("`") && !l.startsWith("📍"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function statusLine(state) {
  const bp = state.blueprint;
  const inv = Object.entries(state.inv)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${BLOCKS[k] ?? k} ${n}`)
    .join(", ");
  const parts = [
    `📍 ${state.px},${state.py}`,
    `⛏ ${state.mined}`,
    `🧱 ${state.placed}`,
    `🎒 ${inv || "empty"}`,
  ];
  if (state.sel) parts.push(`🖐 ${BLOCKS[state.sel] ?? state.sel}`);
  if (bp) parts.push(`📐 ${bp.filled.filter(Boolean).length}/${bp.cells.length} blueprint`);
  else parts.push(`🎯 ${state.placed}/${state.goal}`);
  parts.push(`turn ${state.turn}`);
  return parts.join(" · ");
}

function view(state, note = "") {
  return `${renderWorld(state)}\n\n${statusLine(state)}${note ? `\n${note}` : ""}\n\n\`${LEGEND}\``;
}

// ---------- actions ----------------------------------------------------------

/** Where does this command act? `at x y`, `up`/`down`, or the faced cell. */
function targetOf(state, words) {
  const at = words.indexOf("at");
  if (at !== -1) {
    const x = Number(words[at + 1]);
    const y = Number(words[at + 2]);
    if (Number.isFinite(x) && Number.isFinite(y)) return [Math.round(x), Math.round(y)];
  }
  if (words.includes("up") || words.includes("above")) return [state.px, state.py - 1];
  if (words.includes("down") || words.includes("below")) return [state.px, state.py + 1];
  if (words.includes("left")) return [state.px - 1, state.py];
  if (words.includes("right")) return [state.px + 1, state.py];
  return [state.px + (state.facing ?? 1), state.py];
}

/** Place `code` into each free cell. Returns a new state, or null if none placed. */
function putBlocks(state, code, cells) {
  const rows = state.rows.map((r) => [...r]);
  const inv = { ...state.inv };
  const blueprint = state.blueprint;
  let placed = 0;
  let bp = blueprint;

  for (const [x, y] of cells) {
    if (!inBounds(x, y)) continue;
    if (isSolid(rows, x, y)) continue;
    if ((inv[code] ?? 0) <= 0) break;
    rows[y][x] = code;
    inv[code] -= 1;
    placed += 1;
    if (bp) {
      const idx = bp.cells.findIndex(([cx, cy]) => cx === x && cy === y);
      if (idx !== -1 && !bp.filled[idx]) {
        const filled = [...bp.filled];
        filled[idx] = true;
        bp = { ...bp, filled };
      }
    }
  }
  if (placed === 0) return null;
  return { ...state, rows, inv, placed: state.placed + placed, blueprint: bp };
}

/** Auto-build: finish the blueprint, or raise a little house if there isn't one. */
function fillWorld(state, wantCode) {
  const bp = state.blueprint;
  if (bp) {
    const open = bp.cells.filter((_, i) => !bp.filled[i]);
    return putBlocks(state, wantCode || bp.mat, open);
  }
  const mat =
    wantCode && PLACEABLE.includes(wantCode)
      ? wantCode
      : PLACEABLE.reduce((best, c) => ((state.inv[c] ?? 0) > (state.inv[best] ?? 0) ? c : best), "w");
  const w = 6;
  const h = 3;
  const baseY = groundAt(state, state.px, state.py);
  const x0 = clamp(state.px - 2, 0, WORLD_W - w);
  const y0 = clamp(baseY - h, 0, WORLD_H - h);
  return putBlocks(state, mat, outlineCells(x0, y0, w, h));
}

/**
 * Apply win conditions after a placement and build the reply. In `creative`
 * mode (the canvas client) the world never ends — hitting the goal celebrates
 * and keeps the sandpit open, because kids don't want the game to stop.
 */
function applyPlace(built, note, creative) {
  const bp = built.blueprint;
  const complete = bp && bp.filled.every(Boolean);
  const reached = !bp && built.placed >= built.goal;
  const score = built.placed * 2 + built.mined;

  if (!complete && !reached) return { state: built, reply: view(built, note) };

  if (creative) {
    if (built.celebrated) return { state: built, reply: view(built, note) };
    const fresh = { ...built, celebrated: true, score };
    return {
      state: fresh,
      reply: view(
        fresh,
        complete
          ? `🎉 **Blueprint complete!** Keep going — this world is yours.`
          : `🎉 **Goal reached — ${built.placed} blocks placed!** Keep going — this world is yours.`,
      ),
    };
  }

  const final = won(built, { score });
  return {
    state: final,
    reply: view(
      final,
      complete
        ? `🎉 **Blueprint complete!** That's a proper little build. Score: ${score} ⭐`
        : `🎉 **Goal reached — ${built.placed} blocks placed!** Score: ${score} ⭐`,
    ),
  };
}

// ---------- the engine -------------------------------------------------------

function runStep(state, input, opts) {
  const creative = !!(opts && opts.creative);
  const reach = opts && opts.reach ? Number(opts.reach) : 0;

  if (state.status !== "playing") {
    return { state, reply: "🌍 This world is saved. Start a new build to play again!" };
  }

  const words = norm(input).split(" ").filter(Boolean);
  const cmd = words[0] || "look";
  const turn = state.turn + 1;
  const next = { ...state, turn };

  if (cmd === "help" || cmd === "commands" || cmd === "?") {
    return { state: next, reply: HELP };
  }
  if (cmd === "look" || cmd === "view" || cmd === "status" || words.length === 0) {
    return { state: next, reply: view(next) };
  }

  // The architect: the LLM answers with a BUILD spec; parseLlmReply below
  // turns that into blueprint cells.
  if (cmd === "blueprint" || cmd === "design" || cmd === "architect") {
    const want = words.slice(1).join(" ") || "a cosy little cabin";
    return { state: { ...next, want }, needsLlm: true, prompt: want };
  }

  // Hotbar: pick the block you'll build with. Bare `select` cycles.
  if (cmd === "select" || cmd === "sel" || cmd === "pick" || cmd === "hand") {
    const nameArg = words.slice(1).find((w) => !KEYWORDS.has(w)) ?? "";
    if (!nameArg) {
      const i = Math.max(0, PLACEABLE.indexOf(next.sel));
      const code = PLACEABLE[(i + 1) % PLACEABLE.length];
      return { state: { ...next, sel: code }, reply: view(next, `🎒 Now holding ${BLOCKS[code]}.`) };
    }
    const code = codeFromName(nameArg);
    if (!code) {
      return { state: next, reply: view(next, `🧱 Which block? Try \`select wood\`, \`select glass\`…`) };
    }
    if (!PLACEABLE.includes(code)) {
      return { state: next, reply: view(next, `⛏ ${BLOCKS[code]} is an ore — you can't build with it, but it's worth mining.`) };
    }
    return { state: { ...next, sel: code }, reply: view(next, `🎒 Now holding ${BLOCKS[code]}.`) };
  }

  if (cmd === "jump" || cmd === "hop") {
    const ty = state.py - 1;
    if (!inBounds(state.px, ty)) return { state: next, reply: view(next, "🧱 That's the sky — no jumping that high.") };
    if (isSolid(state.rows, state.px, ty)) {
      return { state: next, reply: view(next, "🧱 Something is already above your head.") };
    }
    return { state: { ...next, py: ty }, reply: view({ ...next, py: ty }, "⤴️") };
  }

  if (cmd === "move" || cmd === "go" || cmd === "walk") {
    if (!words.includes("left") && !words.includes("right")) {
      return { state: next, reply: view(next, "🧱 Try `move left` or `move right`.") };
    }
    const dir = words.includes("left") ? -1 : 1;
    const tx = state.px + dir;
    if (tx < 1 || tx > WORLD_W - 2) {
      return { state: next, reply: view(next, "🧱 That's the edge of the world.") };
    }
    const blocked = isSolid(state.rows, tx, state.py);
    let py = state.py;
    if (blocked) {
      // Auto-step up a one-block ledge, Minecraft-style, if there's headroom.
      const above = state.rows[state.py - 1]?.[tx];
      const head = state.rows[state.py - 1]?.[state.px];
      if (above === " " && head === " ") {
        py = state.py - 1;
      } else {
        return { state: { ...next, facing: dir }, reply: view(next, "🧱 A block is in the way — `mine` it first.") };
      }
    }
    const after = { ...next, px: tx, py, facing: dir };
    return { state: after, reply: view(after, dir === -1 ? "⬅️" : "➡️") };
  }

  if (cmd === "mine" || cmd === "dig" || cmd === "break") {
    const t = targetOf(state, words);
    if (!t) return { state: next, reply: view(next, "🧱 Where should I dig? Try `mine`, `mine down`, or `mine at 12 4`.") };
    const [tx, ty] = t;
    if (!inBounds(tx, ty)) return { state: next, reply: view(next, "🧱 That's outside the world.") };
    if (!inReach(state, tx, ty, reach)) {
      return { state: next, reply: view(next, "🧱 Too far to reach — walk closer first.") };
    }
    const code = state.rows[ty][tx];
    if (!code || code === " ") {
      return { state: next, reply: view(next, "🧱 Just air there — try another spot.") };
    }
    const rows = state.rows.map((r) => [...r]);
    rows[ty][tx] = " ";
    const inv = { ...state.inv, [code]: (state.inv[code] ?? 0) + 1 };
    // Digging straight down drops you into the hole.
    const py = ty === state.py + 1 ? ty : state.py;
    const after = { ...next, rows, inv, py, mined: state.mined + 1 };
    return { state: after, reply: view(after, `⛏ Mined ${BLOCKS[code] ?? code}!`) };
  }

  if (cmd === "place" || cmd === "put" || cmd === "build") {
    const nameArg = words.slice(1).find((w) => !KEYWORDS.has(w) && !/^-?\d+$/.test(w)) ?? "";
    const code = nameArg ? codeFromName(nameArg) : PLACEABLE.includes(next.sel) ? next.sel : null;
    if (!code) {
      return { state: next, reply: view(next, "🧱 Which block? Try `place wood`, `place stone`, `place glass`…") };
    }
    // Check what you're carrying BEFORE the target cell, so "out of blocks"
    // is never reported as "something's already there".
    if ((state.inv[code] ?? 0) <= 0) {
      return {
        state: next,
        reply: view(next, `🎒 You're out of ${BLOCKS[code]} — mine some first! (\`mine\`, \`mine left\`, \`mine down\`)`),
      };
    }
    const t = targetOf(state, words);
    if (!t) return { state: next, reply: view(next, "🧱 Where should I build? Try `place wood up` or `place wood at 12 4`.") };
    const [tx, ty] = t;
    if (!inBounds(tx, ty)) return { state: next, reply: view(next, "🧱 That's outside the world.") };
    if (!inReach(state, tx, ty, reach)) {
      return { state: next, reply: view(next, "🧱 Too far to reach — walk closer first.") };
    }
    if (isSolid(state.rows, tx, ty)) {
      return { state: next, reply: view(next, "🧱 Something's already there.") };
    }
    const built = putBlocks(next, code, [[tx, ty]]);
    if (!built) return { state: next, reply: view(next, "🧱 Something's already there.") };
    return applyPlace(built, `🧱 Placed ${BLOCKS[code]}.`, creative);
  }

  if (cmd === "fill" || cmd === "autofill" || cmd === "build-it") {
    const wantCode = codeFromName(words[1] || "") || materialFromWord(words[1] || "");
    const built = fillWorld(next, wantCode);
    if (!built || built.placed === state.placed) {
      return { state: next, reply: view(next, "🎒 Not enough blocks to build with — `mine` some first!") };
    }
    const gained = built.placed - state.placed;
    return applyPlace(built, `🏗️ Built ${gained} blocks at once!`, creative);
  }

  if (cmd === "digto" || cmd === "tunnel") {
    const target = clamp(Number(words[1]) || state.px, 1, WORLD_W - 2);
    const dir = target >= state.px ? 1 : -1;
    const tx = state.px + dir;
    const ty = state.py + 1;
    if (inBounds(tx, ty) && isSolid(state.rows, tx, ty)) {
      const rows = state.rows.map((r) => [...r]);
      const code = rows[ty][tx];
      rows[ty][tx] = " ";
      const inv = { ...state.inv, [code]: (state.inv[code] ?? 0) + 1 };
      const after = { ...next, rows, inv, mined: state.mined + 1, facing: dir };
      return { state: after, reply: view(after, `⛏ Tunneling toward x=${target}…`) };
    }
    if (!inBounds(tx, state.py)) return { state: next, reply: view(next, "🧱 That's the edge of the world.") };
    const after = { ...next, px: tx, facing: dir };
    return { state: after, reply: view(after, `⛏ Tunneling toward x=${target}…`) };
  }

  return { state: next, reply: view(next, "🧱 I didn't catch that — type `help` for the commands.") };
}

export const blockcraft = {
  id: "blockcraft",

  seed(opts = {}) {
    const { rows, height } = genWorld();
    const px = clamp(Math.floor(WORLD_W / 2) + (Math.random() < 0.5 ? -3 : 3), 1, WORLD_W - 2);
    const inv = emptyInv();
    inv.w = 8; // enough to put up a small shelter
    inv.b = 6;
    return {
      rows,
      px,
      py: height[px] - 1,
      facing: 1,
      inv,
      sel: "w",
      reach: REACH,
      turn: 0,
      mined: 0,
      placed: 0,
      goal: clamp(Number(opts.goal) || 24, 6, 120),
      blueprint: null,
      status: "playing",
    };
  },

  intro(s) {
    return (
      `🧱 **Blockcraft** — your own little world.\n\n` +
      `Tap a block to **mine** it, tap the sky to **place** one, and use the arrows to walk.\n` +
      `Everything you mine goes in your backpack — coal and iron too. ⛏️\n\n` +
      `Want a building? Type \`blueprint cosy cabin\` and I'll design one you can fill in.\n\n${HELP}`
    );
  },

  /**
   * `opts.quiet` adds a `note` (the one-line human message) for the GUI client,
   * which never renders the ASCII frame. `opts.creative` keeps the world open
   * forever. `opts.reach` limits mining/placing to arm's reach from the player.
   */
  step(state, input, opts = {}) {
    const r = runStep(state, input, opts);
    if (opts && opts.quiet) r.note = extractNote(r.reply);
    return r;
  },

  target: targetOf,
  put: putBlocks,
  fill: fillWorld,
  afterPlace: (built, note) => applyPlace(built, note, false),

  systemPrompt(s) {
    const want = s.want || "a cosy little cabin";
    return (
      `You are the Architect of a tiny voxel world (Blockcraft) that the player is building block by block.\n` +
      `They asked for: "${String(want).slice(0, 120)}".\n` +
      `Reply with ONE warm, short sentence about the design (under 25 words), then a final line in EXACTLY this format, with nothing after it:\n` +
      `BUILD <width>x<height> <material>\n` +
      `Rules: width 3-12, height 2-6, material one of wood, stone, brick, glass, leaves. Example: BUILD 8x4 wood`
    );
  },

  /** Turn the architect's `BUILD w x h material` line into blueprint cells. */
  parseLlmReply(state, reply) {
    const m = String(reply).match(/BUILD\s+(\d{1,2})\s*[x×]\s*(\d{1,2})\s+([a-z]+)/i);
    if (!m) return null;
    const w = clamp(parseInt(m[1], 10) || 6, 3, 12);
    const h = clamp(parseInt(m[2], 10) || 4, 2, 6);
    const mat = materialFromWord(m[3]) || "w";

    const baseY = groundAt(state, state.px, state.py);
    const x0 = clamp(state.px - 1, 0, WORLD_W - w);
    const y0 = clamp(baseY - h, 0, WORLD_H - h);
    const cells = outlineCells(x0, y0, w, h).filter(([x, y]) => inBounds(x, y));
    if (cells.length === 0) return null;
    return { ...state, blueprint: { w, h, mat, x0, y0, cells, filled: cells.map(() => false) } };
  },

  fallback(s) {
    return (
      `😴 My architect fell asleep offline. No worries — the blocks are still here!\n\n` +
      view(s, "Build by hand with `mine` and `place wood`, or `fill` what you're carrying.")
    );
  },
};