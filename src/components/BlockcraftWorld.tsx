// 🧱 Blockcraft's graphical front-end — a real little voxel sandbox on a canvas.
//
// The server owns the world (server/blockcraft.mjs); this component only paints
// the state it is given and turns taps into engine verbs (`mine at 4 7`,
// `place w at 9 5`, `move left`, `select glass`). No typing, no chat bubbles:
// every click is a silent round trip that comes back as a fresh state.
//
// Kept deliberately dependency-light — one canvas, a few buttons — so it also
// renders fine inside the desktop webview and on a phone in the Android client.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Hammer, Pickaxe, Sparkles } from "lucide-react";

const WORLD_W = 30;
const WORLD_H = 12;
/** Blocks offered in the hotbar, in order. Ores (coal/iron) are mined, not built. */
const HOTBAR = ["w", "b", "s", "g", "l", "d"] as const;

interface Skin {
  label: string;
  base: string;
  top: string;
  bottom: string;
  spot: string;
}

const SKINS: Record<string, Skin> = {
  d: { label: "Dirt", base: "#8a5a3b", top: "#a9714b", bottom: "#6b4229", spot: "#7a4f34" },
  s: { label: "Stone", base: "#9aa0a6", top: "#b3b8bd", bottom: "#767b80", spot: "#868b90" },
  w: { label: "Wood", base: "#a9743f", top: "#c08c50", bottom: "#855a2f", spot: "#8f5f33" },
  l: { label: "Leaves", base: "#3f9e46", top: "#57c25c", bottom: "#2f7c36", spot: "#47954b" },
  g: { label: "Glass", base: "#a9dcf0", top: "#d6f2ff", bottom: "#82bed8", spot: "#c4e9f7" },
  b: { label: "Brick", base: "#b5503c", top: "#c9664f", bottom: "#8e3d2d", spot: "#e0bdae" },
  c: { label: "Coal", base: "#4a4f56", top: "#5c626a", bottom: "#33373c", spot: "#1f2429" },
  i: { label: "Iron", base: "#c9a882", top: "#e2c9a8", bottom: "#a4865f", spot: "#f0e6d4" },
};

const SKIN_OF = (code: string): Skin => SKINS[code] ?? SKINS.s;

// ---------- state -----------------------------------------------------------

interface Blueprint {
  w: number;
  h: number;
  mat: string;
  cells: [number, number][];
  filled: boolean[];
}

interface World {
  rows: string[][];
  px: number;
  py: number;
  facing: number;
  inv: Record<string, number>;
  sel: string;
  reach: number;
  goal: number;
  placed: number;
  mined: number;
  celebrated: boolean;
  bp: Blueprint | null;
}

/** Tolerant read of the engine state — the canvas must never crash on a shape it doesn't know. */
function readWorld(state: Record<string, unknown>): World {
  const rows = Array.isArray(state.rows)
    ? (state.rows as unknown[]).map((r) => (Array.isArray(r) ? (r as unknown[]).map(String) : []))
    : [];
  const inv = (state.inv && typeof state.inv === "object" ? state.inv : {}) as Record<string, unknown>;
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(inv)) counts[k] = typeof v === "number" ? v : 0;
  const num = (v: unknown, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? v : dflt);
  const rawBp = state.blueprint as Partial<Blueprint> | null | undefined;
  const bp =
    rawBp && Array.isArray(rawBp.cells)
      ? {
          w: num(rawBp.w, 1),
          h: num(rawBp.h, 1),
          mat: typeof rawBp.mat === "string" ? rawBp.mat : "w",
          cells: rawBp.cells as [number, number][],
          filled: Array.isArray(rawBp.filled) ? (rawBp.filled as boolean[]) : [],
        }
      : null;
  return {
    rows,
    px: num(state.px, Math.floor(WORLD_W / 2)),
    py: num(state.py, 0),
    facing: num(state.facing, 1) >= 0 ? 1 : -1,
    inv: counts,
    sel: typeof state.sel === "string" ? state.sel : "w",
    reach: num(state.reach, 6),
    goal: num(state.goal, 24),
    placed: num(state.placed, 0),
    mined: num(state.mined, 0),
    celebrated: !!state.celebrated,
    bp,
  };
}

// ---------- painting --------------------------------------------------------

/** Stable per-cell pseudo-randomness, so speckles don't shimmer between frames. */
const rnd = (x: number, y: number, k: number): number => {
  const n = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

function drawTile(ctx: CanvasRenderingContext2D, code: string, x: number, y: number, s: number, openAbove: boolean) {
  const p = SKIN_OF(code);
  const lite = Math.max(1, Math.round(s * 0.16));
  const dark = Math.max(1, Math.round(s * 0.14));

  if (code === "g") ctx.globalAlpha = 0.72;
  ctx.fillStyle = p.base;
  ctx.fillRect(x, y, s, s);
  ctx.fillStyle = p.top;
  ctx.fillRect(x, y, s, lite);
  ctx.fillStyle = p.bottom;
  ctx.fillRect(x, y + s - dark, s, dark);

  ctx.fillStyle = p.spot;
  if (code === "b") {
    // Brick courses: two mortar lines with a staggered vertical join.
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x, y + s * 0.36, s, Math.max(1, s * 0.07));
    ctx.fillRect(x, y + s * 0.7, s, Math.max(1, s * 0.07));
    ctx.fillRect(x + s * 0.46, y, Math.max(1, s * 0.07), s * 0.36);
    ctx.fillRect(x + s * 0.16, y + s * 0.36, Math.max(1, s * 0.07), s * 0.34);
    ctx.fillRect(x + s * 0.7, y + s * 0.7, Math.max(1, s * 0.07), s * 0.3);
    ctx.globalAlpha = 1;
  } else if (code === "w") {
    // Vertical grain.
    for (let k = 0; k < 3; k++) {
      const gx = x + s * (0.18 + 0.3 * k) + (rnd(x, y, k) - 0.5) * s * 0.06;
      ctx.fillRect(gx, y + lite, Math.max(1, s * 0.07), s - lite - dark);
    }
  } else if (code === "l") {
    // Leafy clumps and a few see-through holes.
    for (let k = 0; k < 4; k++) {
      const rx = x + rnd(x, y, k) * s * 0.8;
      const ry = y + rnd(x, y, k + 9) * s * 0.8;
      ctx.fillRect(rx, ry, s * 0.22, s * 0.22);
    }
  } else if (code === "c" || code === "i") {
    // Ore blobs.
    for (let k = 0; k < 3; k++) {
      const rx = x + s * (0.15 + 0.6 * rnd(x, y, k));
      const ry = y + s * (0.2 + 0.55 * rnd(x, y, k + 4));
      const rs = s * (0.16 + 0.12 * rnd(x, y, k + 7));
      ctx.fillRect(rx, ry, rs, rs);
    }
  } else if (code === "d") {
    ctx.globalAlpha = 0.4;
    ctx.fillRect(x + s * 0.22, y + s * 0.5, s * 0.18, s * 0.18);
    ctx.fillRect(x + s * 0.62, y + s * 0.7, s * 0.2, s * 0.2);
    ctx.globalAlpha = 1;
  }

  // Grass tuft on any dirt with open sky above — the classic Minecraft cue.
  if (code === "d" && openAbove) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#5fa33f";
    ctx.fillRect(x, y, s, s * 0.3);
    ctx.fillStyle = "#7cc35a";
    ctx.fillRect(x, y, s, s * 0.13);
  }
  if (code === "g") {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, s - ctx.lineWidth, s - ctx.lineWidth);
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, facing: number, held: string) {
  const r = (fx: number, fy: number, fw: number, fh: number) => ctx.fillRect(x + s * fx, y + s * fy, s * fw, s * fh);

  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x + s * 0.5, y + s * 0.95, s * 0.3, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#3b4cc0"; // trousers
  r(0.28, 0.66, 0.18, 0.26);
  r(0.54, 0.66, 0.18, 0.26);
  ctx.fillStyle = "#ff9d3b"; // shirt
  r(0.24, 0.42, 0.52, 0.28);
  ctx.fillStyle = "#ffd0a0"; // arms
  r(0.12, 0.46, 0.13, 0.2);
  r(0.75, 0.46, 0.13, 0.2);
  ctx.fillStyle = "#e8b183"; // face
  r(0.28, 0.1, 0.44, 0.32);
  ctx.fillStyle = "#3b2b1f"; // hair
  r(0.28, 0.1, 0.44, 0.1);

  ctx.fillStyle = "#26313d"; // eyes, shifted toward the way you face
  const ex = facing > 0 ? 0.56 : 0.3;
  r(ex, 0.24, 0.06, 0.08);
  r(facing > 0 ? ex + 0.09 : ex + 0.17, 0.24, 0.06, 0.08);

  // The block in hand, floating just past the leading hand.
  drawTile(ctx, held, x + (facing > 0 ? s * 0.88 : -s * 0.2), y + s * 0.44, s * 0.32, false);
}

// ---------- component -------------------------------------------------------

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export function BlockcraftWorld({
  state,
  onAction,
}: {
  state: Record<string, unknown>;
  onAction: (text: string) => Promise<string | void> | string | void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const msgTimer = useRef<number | null>(null);
  const parts = useRef<Particle[]>([]);
  const raf = useRef<number | null>(null);

  const [size, setSize] = useState({ w: 600, h: 240 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [msg, setMsg] = useState("");
  const [frame, setFrame] = useState(0);

  const w = useMemo(() => readWorld(state), [state]);

  // Measure the canvas so the world scales with the window instead of clipping.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const width = Math.max(260, el.clientWidth);
      setSize({ w: width, h: Math.max(11, Math.min(30, width / WORLD_W)) * WORLD_H });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // --- feedback ------------------------------------------------------------

  const say = useCallback((text: string) => {
    setMsg(text);
    if (msgTimer.current) window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(""), 2600);
  }, []);

  const burst = useCallback((cx: number, cy: number, color: string, n: number) => {
    for (let i = 0; i < n; i++) {
      parts.current.push({
        x: cx + 0.2 + rnd(cx, cy, i) * 0.6,
        y: cy + 0.2 + rnd(cy, cx, i) * 0.6,
        vx: (rnd(cx + i, cy, 3) - 0.5) * 0.16,
        vy: -0.06 - rnd(cy, i, 5) * 0.12,
        life: 18 + Math.floor(rnd(cx, cy, i + 2) * 12),
        color,
      });
    }
    if (raf.current !== null) return;
    const tick = () => {
      const next: Particle[] = [];
      for (const p of parts.current) {
        p.vy += 0.028;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1;
        if (p.life > 0) next.push(p);
      }
      parts.current = next;
      setFrame((f) => f + 1);
      raf.current = next.length ? requestAnimationFrame(tick) : null;
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      if (msgTimer.current) window.clearTimeout(msgTimer.current);
    },
    [],
  );

  /**
   * Clicks are serialized through one promise chain: two taps landing together
   * would otherwise both read the same server state and one would be lost.
   */
  const run = useCallback(
    (text: string) => {
      chain.current = chain.current
        .then(async () => {
          const note = await onAction(text);
          if (typeof note === "string" && note) say(note);
        })
        .catch(() => {
          /* the HUD shows transport errors; keep the world playable */
        });
    },
    [onAction, say],
  );

  const reachable = useCallback((x: number, y: number) => !w.reach || (Math.abs(x - w.px) <= w.reach && Math.abs(y - w.py) <= w.reach + 1), [w]);

  const tap = useCallback(
    (x: number, y: number) => {
      const code = w.rows[y]?.[x] ?? " ";
      if (!reachable(x, y)) return say("🖐 Too far — walk closer!");
      if (code !== " ") {
        const skin = SKIN_OF(code);
        burst(x, y, skin.base, code === "b" || code === "w" ? 5 : 8);
        run(`mine at ${x} ${y}`);
        return;
      }
      if (x === w.px && y === w.py) return say("🙂 That's you!");
      if (x === w.px && y === w.py - 1) return say("🙂 Not right on top of your head!");
      const held = w.sel;
      if ((w.inv[held] ?? 0) <= 0) return say(`🎒 You're out of ${SKIN_OF(held).label.toLowerCase()} — mine some first!`);
      burst(x, y, SKIN_OF(held).top, 4);
      run(`place ${held} at ${x} ${y}`);
    },
    [w, reachable, run, say, burst],
  );

  const digDown = useCallback(() => run("mine down"), [run]);
  const buildFacing = useCallback(() => run(`place ${w.sel}`), [run, w.sel]);

  const onKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Let real buttons keep their own Enter/Space handling.
      if (e.target !== e.currentTarget && (e.target as HTMLElement).tagName !== "CANVAS") return;
      const n = Number(e.key);
      if (n >= 1 && n <= HOTBAR.length) {
        run(`select ${HOTBAR[n - 1]}`);
        e.preventDefault();
        return;
      }
      const moves: Record<string, string> = {
        ArrowLeft: "move left",
        ArrowRight: "move right",
        ArrowUp: "jump",
        ArrowDown: "mine down",
        " ": `place ${w.sel}`,
      };
      const cmd = moves[e.key];
      if (!cmd) return;
      e.preventDefault();
      if (cmd.startsWith("place") && (w.inv[w.sel] ?? 0) <= 0) return say(`🎒 You're out of ${SKIN_OF(w.sel).label.toLowerCase()}!`);
      run(cmd);
    },
    [run, say, w],
  );

  // --- paint ---------------------------------------------------------------

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    c.style.width = `${size.w}px`;
    c.style.height = `${size.h}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const t = size.h / WORLD_H;
    // Sky.
    const sky = ctx.createLinearGradient(0, 0, 0, size.h);
    sky.addColorStop(0, "#6ec3ef");
    sky.addColorStop(1, "#d8f0ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.fillStyle = "rgba(255,244,180,0.95)";
    ctx.beginPath();
    ctx.arc(size.w * 0.86, t * 1.1, t * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 0.31 + 0.08) * size.w) % size.w;
      const cy = t * (0.7 + (i % 3) * 0.8);
      ctx.beginPath();
      ctx.ellipse(cx, cy, t * 0.9, t * 0.32, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + t * 0.5, cy + t * 0.08, t * 0.6, t * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Terrain.
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        const code = w.rows[y]?.[x] ?? " ";
        if (code === " ") continue;
        drawTile(ctx, code, x * t, y * t, t, w.rows[y - 1]?.[x] === " ");
      }
    }

    // Blueprint ghosts — the shape Talia designed, waiting to be filled.
    if (w.bp) {
      ctx.setLineDash([t * 0.18, t * 0.14]);
      ctx.lineWidth = Math.max(1.5, t * 0.09);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.fillStyle = "rgba(56,189,248,0.28)";
      w.bp.cells.forEach(([x, y], i) => {
        if (w.bp?.filled[i]) return;
        ctx.fillRect(x * t + 1, y * t + 1, t - 2, t - 2);
        ctx.strokeRect(x * t + 1.5, y * t + 1.5, t - 3, t - 3);
      });
      ctx.setLineDash([]);
    }

    drawPlayer(ctx, w.px * t, w.py * t, t, w.facing, w.sel);

    // Hover: white for "mine this", green for "build here", red for "too far".
    if (hover) {
      const code = w.rows[hover.y]?.[hover.x] ?? " ";
      const ok = reachable(hover.x, hover.y);
      ctx.lineWidth = Math.max(2, t * 0.11);
      ctx.strokeStyle = !ok ? "rgba(248,113,113,0.95)" : code !== " " ? "rgba(255,255,255,0.95)" : "rgba(74,222,128,0.95)";
      ctx.strokeRect(hover.x * t + 2, hover.y * t + 2, t - 4, t - 4);
    }

    // Block-break confetti.
    const s = t;
    for (const p of parts.current) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 22));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x * s, p.y * s, s * 0.16, s * 0.16);
    }
    ctx.globalAlpha = 1;
  }, [size, w, hover, frame]);

  const cellFrom = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const c = canvasRef.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * WORLD_W);
    const y = Math.floor(((e.clientY - r.top) / r.height) * WORLD_H);
    return x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H ? null : { x, y };
  };

  // --- readouts ------------------------------------------------------------

  const progress = w.goal > 0 ? Math.min(1, w.placed / w.goal) : 0;
  const bpLeft = w.bp ? w.bp.cells.filter((_, i) => !w.bp?.filled[i]).length : 0;
  const ores = (["c", "i"] as const).map((k) => ({ code: k, n: w.inv[k] ?? 0 })).filter((o) => o.n > 0);

  const pad = "flex items-center justify-center rounded-xl active:scale-95 transition";
  const padStyle = { background: "var(--surface-strong)", color: "var(--text)" } as const;

  return (
    <div ref={wrapRef} tabIndex={0} onKeyDown={onKey} className="w-full select-none outline-none">
      <div className="relative overflow-hidden rounded-2xl" style={{ boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.18)" }}>
        <canvas
          ref={canvasRef}
          className="block cursor-pointer"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            const cell = cellFrom(e);
            if (cell) tap(cell.x, cell.y);
          }}
          onPointerMove={(e) => setHover(cellFrom(e))}
          onPointerLeave={() => setHover(null)}
        />
        {msg && (
          <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center px-2">
            <span className="max-w-full truncate rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-extrabold text-white">{msg}</span>
          </div>
        )}
      </div>

      {/* progress + counters */}
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-strong)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.round(progress * 100)}%`, background: "linear-gradient(90deg, #34d399, #fbbf24)" }}
          />
        </div>
        <span className="shrink-0 text-[10px] font-extrabold" style={{ color: "var(--text-soft)" }}>
          🧱 {w.placed}/{w.goal}
        </span>
        <span className="shrink-0 text-[10px] font-extrabold" style={{ color: "var(--text-soft)" }}>
          ⛏ {w.mined}
        </span>
        {ores.map((o) => (
          <span key={o.code} className="shrink-0 text-[10px] font-extrabold" style={{ color: SKIN_OF(o.code).top }}>
            {SKIN_OF(o.code).label.slice(0, 1)} {o.n}
          </span>
        ))}
      </div>

      {w.bp && (
        <div
          className="mt-1.5 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[10px] font-extrabold"
          style={{ background: "color-mix(in srgb, #38bdf8 18%, transparent)", color: "var(--text)" }}
        >
          <Sparkles size={11} />
          {w.bp.w}×{w.bp.h} {SKIN_OF(w.bp.mat).label} design — {bpLeft ? `${bpLeft} block${bpLeft === 1 ? "" : "s"} left` : "done! 🎉"}
        </div>
      )}

      {w.celebrated && (
        <div
          className="mt-1.5 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-extrabold"
          style={{ background: "color-mix(in srgb, #22c55e 20%, transparent)", color: "var(--text)" }}
        >
          🏆 Goal reached! Keep building — this world is yours.
        </div>
      )}

      {/* D-pad + tools + hotbar */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="grid grid-cols-3 gap-1">
          <span />
          <button className={`${pad} h-9 w-9`} style={padStyle} title="Jump" aria-label="Jump" onClick={() => run("jump")}>
            <ChevronUp size={17} />
          </button>
          <span />
          <button className={`${pad} h-9 w-9`} style={padStyle} title="Walk left" aria-label="Walk left" onClick={() => run("move left")}>
            <ChevronLeft size={17} />
          </button>
          <button className={`${pad} h-9 w-9`} style={padStyle} title="Dig down" aria-label="Dig down" onClick={digDown}>
            <ChevronDown size={17} />
          </button>
          <button className={`${pad} h-9 w-9`} style={padStyle} title="Walk right" aria-label="Walk right" onClick={() => run("move right")}>
            <ChevronRight size={17} />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <button
            className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-[11px] font-extrabold text-white active:scale-95 transition"
            style={{ background: "var(--accent-grad)" }}
            title="Dig the block in front of you"
            onClick={() => run("mine")}
          >
            <Pickaxe size={14} /> Dig
          </button>
          <button
            className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-[11px] font-extrabold active:scale-95 transition"
            style={{ ...padStyle, boxShadow: "inset 0 0 0 2px var(--accent)" }}
            title="Place the block you're holding"
            onClick={buildFacing}
          >
            <Hammer size={14} /> Build
          </button>
        </div>

        <div className="flex flex-1 flex-wrap gap-1">
          {HOTBAR.map((code, i) => {
            const skin = SKIN_OF(code);
            const n = w.inv[code] ?? 0;
            const on = w.sel === code;
            return (
              <button
                key={code}
                onClick={() => run(`select ${code}`)}
                title={`${skin.label} — ${n} in your bag`}
                aria-pressed={on}
                className="flex w-12 flex-col items-center gap-0.5 rounded-xl py-1 active:scale-95 transition"
                style={{
                  background: on ? "color-mix(in srgb, var(--accent) 22%, transparent)" : "var(--surface-strong)",
                  boxShadow: on ? "inset 0 0 0 2px var(--accent)" : undefined,
                  opacity: n > 0 ? 1 : 0.5,
                }}
              >
                <span
                  className="block h-4 w-4 rounded-[3px]"
                  style={{
                    background: skin.base,
                    boxShadow: `inset 0 2px 0 ${skin.top}, inset 0 -2px 0 ${skin.bottom}`,
                  }}
                />
                <span className="text-[9px] font-extrabold" style={{ color: "var(--text-faint)" }}>
                  {n} · {i + 1}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-1.5 text-[10px] font-bold" style={{ color: "var(--text-faint)" }}>
        Tap a block to dig it, tap the air to build. Arrows to walk · {HOTBAR.map((c, i) => `${i + 1}=${SKIN_OF(c).label}`).join(" · ")}
      </p>
    </div>
  );
}