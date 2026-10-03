// 🍄 Super Hop's graphical front-end — a real side-scrolling platformer.
//
// The server owns the game (server/mario.mjs), but a platformer can't wait for
// a round trip every frame, so this component runs the *same* physics the
// server runs (shared/marioCore.mjs) locally at 60fps and just ships the
// keystrokes along a few times a second for the server to replay.
//
// Because there is one implementation, the local prediction and the server's
// authoritative state are the same numbers — the sync below is a safety net,
// not a source of truth. If the server ever disagrees (a rejected batch, a
// fresh level) we snap to it and carry on.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, Flag, Pause, Play } from "lucide-react";
import {
  ENEMY_H,
  ENEMY_W,
  GOAL_X,
  LEVEL_H,
  LEVEL_SPECS,
  LEVEL_W,
  PLAYER_H,
  PLAYER_W,
  TILE,
  VIEW_H,
  VIEW_W,
  cameraX,
  encodeInput,
  isSolidTile,
  levelTiles,
  makeState,
  progress,
  tick,
  type MarioState,
} from "../../shared/marioCore.mjs";

/** How often we hand a batch of keystrokes to the server. ~12 ticks at 60fps. */
const SYNC_MS = 200;
/** Longest run of input we will ever put in one request (server caps at 180). */
const MAX_BATCH = 120;

const VIEW_PX_W = VIEW_W * TILE;
const VIEW_PX_H = VIEW_H * TILE;

// ---------------------------------------------------------------------------
// state <-> props
// ---------------------------------------------------------------------------

/** Tolerantly rebuild a MarioState from whatever the server sent us. */
function readState(raw: Record<string, unknown>): MarioState {
  if (typeof raw?.px === "number" && Array.isArray(raw.coins) && Array.isArray(raw.enemies)) {
    return raw as unknown as MarioState;
  }
  return makeState();
}

// ---------------------------------------------------------------------------
// particles
// ---------------------------------------------------------------------------

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

// ---------------------------------------------------------------------------
// painting
// ---------------------------------------------------------------------------

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.beginPath();
  ctx.ellipse(x, y, 11 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 9 * s, y - 3 * s, 8 * s, 5.5 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 9 * s, y - 1 * s, 7 * s, 4.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTile(ctx: CanvasRenderingContext2D, ch: string, px: number, py: number, above: string) {
  switch (ch) {
    case "#": {
      // dirt with a grass lip when there's air above
      ctx.fillStyle = "#8a5a3b";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "rgba(0,0,0,0.13)";
      ctx.fillRect(px, py + TILE - 3, TILE, 3);
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect(px + 3, py + 5, 3, 2);
      ctx.fillRect(px + 10, py + 10, 2, 2);
      if (!isSolidTile(above)) {
        ctx.fillStyle = "#4fae43";
        ctx.fillRect(px, py, TILE, 5);
        ctx.fillStyle = "#6bd45c";
        ctx.fillRect(px, py, TILE, 2);
        ctx.fillStyle = "#3f8f37";
        ctx.fillRect(px + 3, py + 5, 2, 3);
        ctx.fillRect(px + 11, py + 5, 2, 4);
      }
      break;
    }
    case "=": {
      // wooden ledge
      ctx.fillStyle = "#a86a35";
      ctx.fillRect(px, py, TILE, 7);
      ctx.fillStyle = "#c98b4e";
      ctx.fillRect(px, py, TILE, 2);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(px, py + 6, TILE, 1);
      ctx.fillRect(px + 7, py + 2, 1, 4);
      break;
    }
    case "P": {
      // warp pipe — the lip is drawn on whichever tile has air above it
      const cap = !isSolidTile(above);
      ctx.fillStyle = "#2f9e3f";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#54d15e";
      ctx.fillRect(px + 2, py, 4, TILE);
      ctx.fillStyle = "#1f6b2a";
      ctx.fillRect(px + TILE - 4, py, 3, TILE);
      if (cap) {
        ctx.fillStyle = "#2f9e3f";
        ctx.fillRect(px - 2, py - 3, TILE + 4, 7);
        ctx.fillStyle = "#6ee06f";
        ctx.fillRect(px - 2, py - 3, TILE + 4, 2);
        ctx.fillStyle = "#1f6b2a";
        ctx.fillRect(px - 2, py + 2, TILE + 4, 2);
      }
      break;
    }
    case "Q": {
      // question block
      ctx.fillStyle = "#e8a33d";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#ffc95e";
      ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
      ctx.fillStyle = "#a86a1c";
      ctx.fillRect(px, py, TILE, 1);
      ctx.fillRect(px, py, 1, TILE);
      ctx.fillRect(px, py + TILE - 1, TILE, 1);
      ctx.fillRect(px + TILE - 1, py, 1, TILE);
      // the little "?"
      ctx.fillStyle = "#7a4a0d";
      ctx.fillRect(px + 6, py + 4, 4, 2);
      ctx.fillRect(px + 9, py + 6, 2, 2);
      ctx.fillRect(px + 7, py + 8, 2, 2);
      ctx.fillRect(px + 6, py + 11, 2, 2);
      break;
    }
    case "B": {
      // bush — pure decoration, you walk straight through it
      ctx.fillStyle = "#3f9e46";
      ctx.beginPath();
      ctx.ellipse(px + 5, py + 12, 6, 5, 0, 0, Math.PI * 2);
      ctx.ellipse(px + 11, py + 10, 5, 6, 0, 0, Math.PI * 2);
      ctx.ellipse(px + 14, py + 12, 5, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5cc45f";
      ctx.beginPath();
      ctx.ellipse(px + 7, py + 9, 3, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default:
      break;
  }
}

function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, phase: number) {
  // Spin by squashing horizontally — reads as rotation without a sprite sheet.
  const w = Math.max(1.6, Math.abs(Math.cos(phase)) * 5 + 1.4);
  const cx = x + TILE / 2;
  const cy = y + TILE / 2 + Math.sin(phase * 0.7) * 1.2;
  ctx.fillStyle = "#c98a12";
  ctx.beginPath();
  ctx.ellipse(cx, cy, w + 0.8, 6.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd54a";
  ctx.beginPath();
  ctx.ellipse(cx, cy, w, 5.2, 0, 0, Math.PI * 2);
  ctx.fill();
  if (w > 3) {
    ctx.fillStyle = "#fff0a8";
    ctx.fillRect(cx - 0.5, cy - 3, 1.5, 6);
  }
}

function drawCritter(ctx: CanvasRenderingContext2D, x: number, y: number, alive: boolean, step: number) {
  if (!alive) {
    ctx.fillStyle = "#8a5a3b";
    ctx.beginPath();
    ctx.ellipse(x + ENEMY_W / 2, y + ENEMY_H - 2, 7, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // feet shuffle so it doesn't look like a statue
  const shuffle = Math.sin(step / 5) > 0 ? 1 : -1;
  ctx.fillStyle = "#5c3a1c";
  ctx.fillRect(x + 1, y + ENEMY_H - 3 + shuffle, 4, 3);
  ctx.fillRect(x + ENEMY_W - 5, y + ENEMY_H - 3 - shuffle, 4, 3);
  ctx.fillStyle = "#b8702f";
  ctx.beginPath();
  ctx.ellipse(x + ENEMY_W / 2, y + 6, 7, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d08a3c";
  ctx.beginPath();
  ctx.ellipse(x + ENEMY_W / 2 - 2, y + 4, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // eyes
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 5, 2.2, 2.8, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 10, y + 5, 2.2, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#241505";
  ctx.fillRect(x + 4, y + 6, 2, 2);
  ctx.fillRect(x + 10, y + 6, 2, 2);
  // frown
  ctx.fillStyle = "#241505";
  ctx.fillRect(x + 5, y + 10, 4, 1);
}

/**
 * The hero. Drawn a little larger than the 10x14 hitbox on purpose — a small
 * sprite at 16px tiles is hard for a child to pick out of the scenery.
 */
function drawHero(ctx: CanvasRenderingContext2D, s: MarioState, blink: boolean) {
  if (blink) return; // invulnerability flicker
  const face = s.face >= 0 ? 1 : -1;
  const running = s.onGround && Math.abs(s.vx) > 0.4;
  const W = 14;
  const H = 17;
  // anchor the feet to the hitbox bottom so the art never floats
  const x = s.px + PLAYER_W / 2 - W / 2;
  const y = s.py + PLAYER_H - H + 1;
  const airborne = !s.onGround;
  const phase = Math.floor(s.tick / 5);

  // legs — alternate when running, tuck up in the air
  const swing = running ? (phase % 2 === 0 ? 1 : -1) : 0;
  ctx.fillStyle = "#2b52a8";
  if (airborne) {
    ctx.fillRect(x + 3, y + 13, 3, 4);
    ctx.fillRect(x + 8, y + 13, 3, 3);
  } else {
    ctx.fillRect(x + 3, y + 13, 3, 4 - Math.max(0, swing));
    ctx.fillRect(x + 8, y + 13, 3, 4 - Math.max(0, -swing));
  }
  ctx.fillStyle = "#6b3a12";
  ctx.fillRect(x + 2, y + H - 1, 5, 2);
  ctx.fillRect(x + 7, y + H - 1, 5, 2);

  // body
  ctx.fillStyle = "#d8453f";
  ctx.fillRect(x + 2, y + 7, 10, 7);
  ctx.fillStyle = "#b5302c";
  ctx.fillRect(x + 2, y + 12, 10, 2);
  // overalls
  ctx.fillStyle = "#2b52a8";
  ctx.fillRect(x + 3, y + 10, 8, 4);
  ctx.fillStyle = "#ffd54a";
  ctx.fillRect(x + 6, y + 10, 2, 2);

  // arm — forward when running, up when jumping
  ctx.fillStyle = "#f3c294";
  if (airborne) ctx.fillRect(face > 0 ? x + 11 : x - 1, y + 5, 3, 5);
  else ctx.fillRect(face > 0 ? x + 11 : x - 1, y + 8, 3, 4);

  // head
  ctx.fillStyle = "#f7c99b";
  ctx.fillRect(x + 2, y + 1, 10, 7);
  // hair at the back
  ctx.fillStyle = "#6b3a12";
  ctx.fillRect(face > 0 ? x + 1 : x + 11, y + 3, 2, 5);
  // cap with a brim
  ctx.fillStyle = "#e23b3b";
  ctx.fillRect(x + 1, y - 1, 12, 3);
  ctx.fillRect(face > 0 ? x + 8 : x, y + 1, 5, 2);
  // eye + moustache
  ctx.fillStyle = "#241505";
  ctx.fillRect(face > 0 ? x + 9 : x + 4, y + 3, 2, 2);
  ctx.fillRect(face > 0 ? x + 5 : x + 4, y + 6, 5, 2);
}

/** The castle at the end of the level — the reason you're running. */
function drawCastle(ctx: CanvasRenderingContext2D, px: number, groundTop: number) {
  const y = groundTop - 5 * TILE;
  const brick = "#c9a06a";
  ctx.fillStyle = brick;
  ctx.fillRect(px + 6, y + 2 * TILE, 5 * TILE, 3 * TILE); // keep
  ctx.fillStyle = "#b58a55";
  ctx.fillRect(px + 6, y + 4 * TILE, 5 * TILE, TILE);
  // battlements
  for (let i = 0; i < 5; i++) ctx.fillRect(px + 6 + i * TILE, y + TILE, TILE / 2, TILE);
  // towers
  ctx.fillStyle = brick;
  ctx.fillRect(px, y + 2 * TILE, 2 * TILE, 3 * TILE);
  ctx.fillRect(px + 9 * TILE, y + 2 * TILE, 2 * TILE, 3 * TILE);
  for (let i = 0; i < 2; i++) {
    ctx.fillRect(px + i * TILE, y + TILE, TILE / 2, TILE);
    ctx.fillRect(px + 9 * TILE + i * TILE, y + TILE, TILE / 2, TILE);
  }
  // door
  ctx.fillStyle = "#4a2f14";
  ctx.beginPath();
  ctx.arc(px + 8, y + 5 * TILE, 6, Math.PI, 0);
  ctx.fillRect(px + 2, y + 5 * TILE, 12, TILE);
  // windows
  ctx.fillStyle = "#2b1b08";
  ctx.fillRect(px + 4, y + 3 * TILE, 4, 5);
  ctx.fillRect(px + 13, y + 3 * TILE, 4, 5);
}

function drawFlag(ctx: CanvasRenderingContext2D, px: number, groundTop: number) {
  drawCastle(ctx, px - 6 * TILE, groundTop);
  const top = groundTop - 5 * TILE;
  ctx.fillStyle = "#d8d8d8";
  ctx.fillRect(px, top, 2, 5 * TILE);
  ctx.fillStyle = "#e2e2e2";
  ctx.fillRect(px, top, 1, 5 * TILE);
  ctx.fillStyle = "#37c96b";
  ctx.beginPath();
  ctx.moveTo(px + 2, top + 1);
  ctx.lineTo(px + 14, top + 6);
  ctx.lineTo(px + 2, top + 11);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2aa356";
  ctx.fillRect(px + 2, top + 9, 12, 2);
}

// ---------------------------------------------------------------------------
// component
// ---------------------------------------------------------------------------

export function MarioGame({
  state,
  onAction,
  onPickLevel,
}: {
  state: Record<string, unknown>;
  /** Optional: without it the game still runs locally, it just won't sync. */
  onAction?: (text: string) => Promise<string | void> | string | void;
  /** Jump straight to another level from the picker under the canvas. */
  onPickLevel?: (level: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<MarioState>(readState(state));
  const held = useRef({ left: false, right: false, jump: false });
  const pending = useRef<string[]>([]);
  const inFlight = useRef(false);
  /**
   * The tick the server will report back for the batch we just sent. One
   * character is exactly one tick, so this is simply "now minus what's still
   * queued". Matching it proves the server replayed our inputs to the same
   * numbers we predicted, and lets us carry on without rewinding a frame.
   */
  const expected = useRef<number | null>(null);
  const lastSync = useRef(0);
  const bits = useRef<Bit[]>([]);
  const paused = useRef(false);

  const [size, setSize] = useState({ w: 640, h: 457 });
  const [note, setNote] = useState("");
  const [hud, setHud] = useState({ score: 0, coins: 0, total: 0, lives: 3, pct: 0, status: "playing" });
  // Which level is on screen, straight off the server's state — never guessed,
  // so the picker can never highlight a level you aren't actually on.
  const level = Math.max(0, Math.min(LEVEL_SPECS.length - 1, Number(state.level ?? 0) || 0));
  const [pausedUi, setPausedUi] = useState(false);
  const noteTimer = useRef<number | null>(null);

  const say = useCallback((text: string) => {
    setNote(text);
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(""), 1400);
  }, []);

  // ---- adopt server state (first load, restart, or a corrected batch) -----
  useEffect(() => {
    const incoming = readState(state);
    // The expected case: the server replayed exactly the inputs we predicted.
    // Keep our (slightly more advanced) local state and drop the credit. The
    // level has to match too — a freshly started level also sits on tick 0.
    if (expected.current !== null && incoming.tick === expected.current && incoming.level === stRef.current.level) {
      expected.current = null;
      return;
    }
    // Anything else means the server is telling us something new — a fresh
    // level, or a batch it refused. The server is the truth, so take it.
    expected.current = null;
    stRef.current = incoming;
    pending.current = [];
  }, [state]);

  // ---- size -------------------------------------------------------------
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(280, Math.floor(el.clientWidth));
      setSize({ w, h: Math.round((w * VIEW_PX_H) / VIEW_PX_W) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- keyboard ---------------------------------------------------------
  useEffect(() => {
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      if (typing() || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") held.current.left = true;
      else if (k === "ArrowRight" || k === "d" || k === "D") held.current.right = true;
      else if (k === " " || k === "ArrowUp" || k === "w" || k === "W") held.current.jump = true;
      else return;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") held.current.left = false;
      else if (k === "ArrowRight" || k === "d" || k === "D") held.current.right = false;
      else if (k === " " || k === "ArrowUp" || k === "w" || k === "W") held.current.jump = false;
    };
    const blur = () => {
      held.current = { left: false, right: false, jump: false };
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // ---- the loop ---------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudAcc = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // Clamp dt so a backgrounded tab doesn't fast-forward the level.
      const dt = Math.min(now - last, 100);
      last = now;
      acc += dt;

      const STEP = 1000 / 60;
      let s = stRef.current;
      const ch = paused.current ? "-" : encodeInput(held.current);
      let guard = 0;
      while (acc >= STEP && guard++ < 6) {
        acc -= STEP;
        s = tick(s, ch);
        if (!paused.current) pending.current.push(ch);
      }

      // Spawn a little confetti for whatever the simulation just reported.
      for (const e of s.events) {
        const bx = s.px + PLAYER_W / 2;
        const by = s.py + PLAYER_H / 2;
        if (e === "coin") burst(bits.current, bx, by, "#ffd54a", 5);
        else if (e === "stomp") burst(bits.current, bx, by + 6, "#ffffff", 8);
        else if (e === "hurt" || e === "pit") burst(bits.current, bx, by, "#ff6b6b", 12);
        else if (e === "win") {
          for (let i = 0; i < 40; i++) {
            bits.current.push({
              x: bx,
              y: by,
              vx: (Math.sin(i * 2.4) * 2.4) | 0,
              vy: -(1 + (i % 5)),
              life: 90,
              color: ["#ffd54a", "#37c96b", "#4aa8ff", "#ff6b6b"][i % 4],
              size: 3,
            });
          }
        }
      }

      stRef.current = s;

      // ---- hand the batch to the server ---------------------------------
      const now2 = performance.now();
      if (onAction && now2 - lastSync.current > SYNC_MS && pending.current.length && !inFlight.current) {
        const sent = pending.current.slice(0, MAX_BATCH).join("");
        pending.current = pending.current.slice(MAX_BATCH);
        lastSync.current = now2;
        inFlight.current = true;
        // One queued char == one unconfirmed tick.
        expected.current = stRef.current.tick - pending.current.length;
        Promise.resolve(onAction(`go ${sent}`))
          .then((n) => {
            if (typeof n === "string" && n) say(n);
          })
          .catch(() => {
            /* transport hiccup — the next response resynchronises us */
          })
          .finally(() => {
            inFlight.current = false;
          });
      }

      // ---- paint ---------------------------------------------------------
      const sc = size.w / VIEW_PX_W;
      ctx.save();
      ctx.scale(sc, sc);
      ctx.clearRect(0, 0, VIEW_PX_W, VIEW_PX_H);

      const sky = ctx.createLinearGradient(0, 0, 0, VIEW_PX_H);
      sky.addColorStop(0, "#63b8ec");
      sky.addColorStop(1, "#cdeeff");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, VIEW_PX_W, VIEW_PX_H);

      // sun
      ctx.fillStyle = "rgba(255,238,150,0.95)";
      ctx.beginPath();
      ctx.arc(VIEW_PX_W - 40, 28, 13, 0, Math.PI * 2);
      ctx.fill();

      const cam = cameraX(s);
      // clouds drift slower than the world for a bit of depth
      for (let i = 0; i < 6; i++) {
        const cxp = (((i * 137 - cam * 0.32) % (VIEW_PX_W + 90)) + VIEW_PX_W + 90) % (VIEW_PX_W + 90) - 45;
        drawCloud(ctx, cxp, 26 + (i % 3) * 17, 1 + (i % 2) * 0.25);
      }
      // far hills
      ctx.fillStyle = "#7fc98a";
      for (let i = -1; i < 7; i++) {
        const hx = i * 70 - ((cam * 0.45) % 70);
        ctx.beginPath();
        ctx.ellipse(hx, VIEW_PX_H - 34, 46, 30, 0, Math.PI, 0);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(-cam, 0);

      const firstTx = Math.max(0, Math.floor(cam / TILE) - 1);
      const lastTx = Math.min(LEVEL_W, firstTx + VIEW_W + 3);
      const terrain = levelTiles(s.level);
      // Background decoration first, then anything you can stand on.
      for (let ty = 0; ty < LEVEL_H; ty++) {
        const row = terrain[ty];
        for (let tx = firstTx; tx < lastTx; tx++) {
          const ch2 = row[tx];
          if (ch2 !== "B") continue;
          drawTile(ctx, ch2, tx * TILE, ty * TILE, row[tx - 1] ?? ".");
        }
      }
      for (let ty = 0; ty < LEVEL_H; ty++) {
        const row = terrain[ty];
        for (let tx = firstTx; tx < lastTx; tx++) {
          const ch2 = row[tx];
          if (!ch2 || ch2 === "." || ch2 === "o" || ch2 === "^" || ch2 === "B" || ch2 === "F") continue;
          drawTile(ctx, ch2, tx * TILE, ty * TILE, ty > 0 ? row[tx - 1] : "#");
        }
      }

      drawFlag(ctx, GOAL_X * TILE, 12);

      for (const c of s.coins) {
        if (c.got) continue;
        if (c.x * TILE < cam - TILE || c.x * TILE > cam + VIEW_PX_W + TILE) continue;
        drawCoin(ctx, c.x * TILE, c.y * TILE, s.tick / 9);
      }
      for (const e of s.enemies) {
        if (e.x < cam - TILE * 2 || e.x > cam + VIEW_PX_W + TILE * 2) continue;
        drawCritter(ctx, e.x, e.y, e.alive, s.tick);
      }

      // particles
      for (const b of bits.current) {
        b.x += b.vx;
        b.y += b.vy;
        b.vy += 0.28;
        b.life -= 1;
        if (b.life <= 0) continue;
        ctx.globalAlpha = Math.max(0, Math.min(1, b.life / 30));
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, b.y, b.size, b.size);
      }
      ctx.globalAlpha = 1;
      bits.current = bits.current.filter((b) => b.life > 0);

      drawHero(ctx, s, s.invuln > 0 && Math.floor(s.tick / 4) % 2 === 0);
      ctx.restore();
      ctx.restore();

      // ---- HUD (re-rendered at ~10fps; React doesn't need 60) ------------
      hudAcc += dt;
      if (hudAcc > 100) {
        hudAcc = 0;
        setHud({
          score: s.score,
          coins: s.coinsGot,
          total: s.coinsTotal ?? s.coins.length,
          lives: s.lives,
          pct: progress(s),
          status: s.status,
        });
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size, onAction, say]);

  // Hold jump buttons down while a finger is on them.
  const bindHold = (key: "left" | "right" | "jump") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      held.current[key] = true;
    },
    onPointerUp: () => {
      held.current[key] = false;
    },
    onPointerLeave: () => {
      held.current[key] = false;
    },
    onPointerCancel: () => {
      held.current[key] = false;
    },
  });

  const padBig = "flex h-14 items-center justify-center gap-1 rounded-2xl active:scale-95 transition select-none touch-none";
  const padStyle = { background: "var(--surface-strong)", color: "var(--text)" } as const;

  return (
    <div>
      <div ref={wrapRef} className="relative overflow-hidden rounded-2xl" style={{ boxShadow: "inset 0 0 0 1px var(--border)" }}>
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: size.h }}
          aria-label="Super Hop — a side-scrolling platformer. Use the arrow keys to run and space to jump."
        />
        {note && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-2">
            <span
              className="rounded-full px-3 py-1 text-[11px] font-extrabold shadow-plush"
              style={{ background: "rgba(0,0,0,0.62)", color: "#fff" }}
            >
              {note}
            </span>
          </div>
        )}
        {hud.status !== "playing" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45">
            <span className="text-3xl">{hud.status === "won" ? "🏁" : "💔"}</span>
            <span className="text-lg font-black text-white">
              {hud.status === "won" ? "You made it!" : "Out of lives"}
            </span>
            <span className="text-[11px] font-bold text-white/80">
              ⭐ {hud.score} · 🪙 {hud.coins}/{hud.total}
            </span>
            <span className="text-[10px] text-white/60">Hit “Play again” above to have another go</span>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-extrabold" style={{ color: "var(--text-soft)" }}>
          <Flag size={12} /> {Math.round(hud.pct * 100)}%
        </span>
        <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-strong)" }}>
          <div
            className="h-full rounded-full transition-[width] duration-200"
            style={{ width: `${Math.round(hud.pct * 100)}%`, background: "var(--accent-grad)" }}
          />
        </div>
        <span className="text-[11px] font-extrabold" style={{ color: "var(--text-soft)" }}>
          🪙 {hud.coins}/{hud.total} · ⭐ {hud.score} · {"❤️".repeat(Math.max(0, hud.lives)) || "💔"}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {/* Big, obvious, thumb-sized. Kids on a laptop still use the keys,
            but these mean nobody has to guess what the arrows are for. */}
        <div className="flex items-center gap-1.5">
          <button
            {...bindHold("left")}
            className={`${padBig} w-14`}
            style={padStyle}
            aria-label="Run left"
            title="Hold to run left (←)"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            {...bindHold("right")}
            className={`${padBig} w-14`}
            style={padStyle}
            aria-label="Run right"
            title="Hold to run right (→)"
          >
            <ChevronRight size={24} />
          </button>
        </div>
        <button
          {...bindHold("jump")}
          className={`${padBig} w-24 text-sm`}
          style={{ background: "var(--accent-grad)", color: "#fff", fontWeight: 900 }}
          aria-label="Jump"
          title="Hold to jump higher (Space)"
        >
          <ChevronUp size={20} /> JUMP
        </button>
        <div className="flex-1" />
        <button
          className={`${padBig} w-12`}
          style={padStyle}
          aria-label={pausedUi ? "Resume" : "Pause"}
          onClick={() => {
            paused.current = !paused.current;
            setPausedUi(!pausedUi);
            if (paused.current) held.current = { left: false, right: false, jump: false };
          }}
        >
          {pausedUi ? <Play size={18} /> : <Pause size={18} />}
        </button>
      </div>

      {onPickLevel && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-extrabold" style={{ color: "var(--text-faint)" }}>
            Level
          </span>
          {LEVEL_SPECS.map((l, i) => {
            const here = i === level;
            return (
              <button
                key={l.id}
                onClick={() => onPickLevel(i)}
                disabled={here}
                title={`${l.id} ${l.name} — ${l.blurb}`}
                className="rounded-full px-2.5 py-1 text-[11px] font-extrabold transition disabled:cursor-default"
                style={
                  here
                    ? { background: "var(--accent-grad)", color: "#fff" }
                    : { background: "var(--surface-strong)", color: "var(--text-soft)" }
                }
              >
                {l.id}
              </button>
            );
          })}
          <span className="text-[10px] font-bold" style={{ color: "var(--text-faint)" }}>
            {LEVEL_SPECS[level]?.name} — {LEVEL_SPECS[level]?.blurb}
          </span>
        </div>
      )}

      <p className="mt-2 text-[11px] font-extrabold" style={{ color: "var(--text-soft)" }}>
        ⬅️➡️ or A / D to run · SPACE to jump (hold it to jump higher) — hold the buttons below if you prefer
      </p>
      <p className="mt-0.5 text-[10px] font-bold" style={{ color: "var(--text-faint)" }}>
        Stomp the critters, dodge the rest, grab the coins, and reach the castle 🏰
      </p>
    </div>
  );
}

function burst(list: Bit[], x: number, y: number, color: string, n: number) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    list.push({
      x,
      y,
      vx: Math.cos(a) * 1.8,
      vy: Math.sin(a) * 1.8 - 1,
      life: 26,
      color,
      size: 2,
    });
  }
}
