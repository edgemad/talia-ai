// The drawing pad.
//
// Deliberately dependency-free: no image engine, no model, no account. A child
// taps it and can draw immediately, which matters more here than any clever
// feature — the existing Studio is brilliant at making images from a prompt, but
// it needs an engine installed first, which is exactly the wrong thing to put
// in front of a five-year-old's first attempt at drawing.
//
// Choices that are about small hands specifically:
//   · big fat buttons, no hover-dependent behaviour;
//   · colours as one long strip of big dots, not a colour picker;
//   · undo keeps 20 steps, which is about how far back a child actually wants
//     to go before giving up;
//   · saving is one tap and always works offline.

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eraser, ImageDown, Minus, Plus, Redo2, Shapes, Trash2, Undo2 } from "lucide-react";
import { MAX_SKETCHES, deleteSketch, loadSketches, makeFullImage, makeId, makeThumb, saveSketch } from "../lib/sketchStore";

type Tool = "pencil" | "marker" | "crayon" | "eraser" | "line" | "rect" | "circle" | "stamp";

/** Kids' palette — high chroma, nothing muddy. */
const COLORS = [
  "#e11d48",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#78350f",
  "#111827",
];

const STAMPS = ["⭐", "🌸", "🦋", "🐱", "🌈", "❤️", "🚀", "🌻"];

const TOOLS: { id: Tool; label: string; icon: string; hint: string }[] = [
  { id: "pencil", label: "Pencil", icon: "✏️", hint: "Thin lines" },
  { id: "marker", label: "Marker", icon: "🖊️", hint: "Thick lines" },
  { id: "crayon", label: "Crayon", icon: "🖍️", hint: "Chalky" },
  { id: "eraser", label: "Eraser", icon: "🧽", hint: "Rub it out" },
  { id: "line", label: "Line", icon: "📏", hint: "Straight line" },
  { id: "rect", label: "Box", icon: "▭", hint: "Square or rectangle" },
  { id: "circle", label: "Circle", icon: "◯", hint: "Round shape" },
  { id: "stamp", label: "Sticker", icon: "✨", hint: "Tap to place" },
];

const SIZES = [2, 5, 10, 18, 30];
const UNDO_LIMIT = 20;

interface Stroke {
  tool: Tool;
  color: string;
  size: number;
  points: { x: number; y: number }[];
  /** For shapes: where the drag started. */
  from?: { x: number; y: number };
  /** For stamps: which sticker, so undo/redo put back the same one. */
  glyph?: string;
}

function brushFor(tool: Tool) {
  if (tool === "marker") return { cap: "round" as const, join: "round" as const, alpha: 0.85, scale: 1.8 };
  if (tool === "crayon") return { cap: "round" as const, join: "round" as const, alpha: 1, scale: 1, rough: true };
  if (tool === "eraser") return { cap: "round" as const, join: "round" as const, alpha: 1, scale: 3.2, erase: true };
  return { cap: "round" as const, join: "round" as const, alpha: 1, scale: 1 };
}

export function SketchPad() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [tool, setTool] = useState<Tool>("marker");
  const [color, setColor] = useState("#e11d48");
  const [size, setSize] = useState(10);
  const [stamp, setStamp] = useState(STAMPS[0]);

  const strokes = useRef<Stroke[]>([]);
  const redoStack = useRef<Stroke[]>([]);
  const noticeTimer = useRef<number | null>(null);
  const [history, setHistory] = useState(0);
  const [redo, setRedo] = useState(0);
  const drawing = useRef<Stroke | null>(null);
  const [gallery, setGallery] = useState<{ id: string; thumb: string; createdAt: string }[]>([]);
  const [notice, setNotice] = useState("");

  // ---- canvas setup -------------------------------------------------------
  // Sized from its container, and re-sized whenever that container changes. A
  // canvas fixed at mount time ends up wider than its box in a narrow window or
  // on a rotated tablet, which puts the right-hand side of the page completely
  // out of reach of the pointer.
  useEffect(() => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;

    const fit = () => {
      const w = Math.max(240, wrap.clientWidth);
      const h = Math.round(w * 0.62);
      if (w === parseFloat(cv.style.width) && h === parseFloat(cv.style.height)) return;

      // Remember the old size so the drawing can be scaled rather than wiped.
      const prevW = parseFloat(cv.style.width) || w;
      const prevH = parseFloat(cv.style.height) || h;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctxRef.current = ctx;
      // Setting the backing store's size wipes it to transparent, so the paper
      // is repainted every time — otherwise a resized canvas shows the panel
      // behind it instead of a sheet of white paper.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);

      const sx = w / prevW;
      const sy = h / prevH;
      if (strokes.current.length) {
        const remap = (p: { x: number; y: number }) => ({ x: p.x * sx, y: p.y * sy });
        strokes.current = strokes.current.map((s) => ({
          ...s,
          points: s.points.map(remap),
          from: s.from ? remap(s.from) : undefined,
        }));
        for (const s of strokes.current) paintStroke(ctx, s, false);
      }
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    setGallery(loadSketches(window.localStorage));
    return () => ro.disconnect();
  }, []);

  const redrawAll = useCallback(() => {
    const ctx = ctxRef.current;
    const cv = canvasRef.current;
    if (!ctx || !cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.scale(dpr, dpr);
    for (const s of strokes.current) paintStroke(ctx, s, false);
  }, []);

  const pushStroke = (s: Stroke) => {
    strokes.current = [...strokes.current, s].slice(-UNDO_LIMIT);
    redoStack.current = [];
    setHistory(strokes.current.length);
    setRedo(0);
  };

  // ---- pointer handling ---------------------------------------------------
  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointAt(e);

    if (tool === "stamp") {
      const s: Stroke = { tool, color, size: 34, points: [p], glyph: stamp };
      ctx.save();
      ctx.font = "34px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(stamp, p.x, p.y);
      ctx.restore();
      pushStroke(s);
      return;
    }

    const s: Stroke = { tool, color, size, points: [p], from: p };
    drawing.current = s;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (size * brushFor(tool).scale) / 2, 0, Math.PI * 2);
    ctx.fillStyle = tool === "eraser" ? "#ffffff" : color;
    ctx.globalAlpha = brushFor(tool).alpha;
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = ctxRef.current;
    const s = drawing.current;
    if (!ctx || !s || tool === "stamp") return;
    const p = pointAt(e);
    s.points.push(p);
    if (s.tool === "line" || s.tool === "rect" || s.tool === "circle") {
      redrawAll();
      previewShape(ctx, s);
    } else {
      paintSegment(ctx, s);
    }
  };

  const onUp = () => {
    const s = drawing.current;
    drawing.current = null;
    if (!s || s.points.length < 1) return;
    if (s.tool === "line" || s.tool === "rect" || s.tool === "circle") {
      redrawAll();
      paintStroke(ctxRef.current!, s, false);
    }
    pushStroke(s);
  };

  // ---- actions ------------------------------------------------------------
  const undo = () => {
    if (!strokes.current.length) return;
    const last = strokes.current[strokes.current.length - 1];
    strokes.current = strokes.current.slice(0, -1);
    redoStack.current.push(last);
    redrawAll();
    setHistory(strokes.current.length);
    setRedo(redoStack.current.length);
  };

  const redoStep = () => {
    const s = redoStack.current.pop();
    if (!s) return;
    strokes.current = [...strokes.current, s];
    redrawAll();
    setHistory(strokes.current.length);
    setRedo(redoStack.current.length);
  };

  const clearAll = () => {
    strokes.current = [];
    redoStack.current = [];
    redrawAll();
    setHistory(0);
    setRedo(0);
  };

  const save = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const thumb = makeThumb(cv);
    if (!thumb) {
      flash("Couldn't make a thumbnail — try clearing a bit first.");
      return;
    }
    const res = saveSketch(window.localStorage, { id: makeId(), thumb, createdAt: new Date().toISOString() });
    setGallery(res.sketches);
    flash(res.failed ? "Out of space — some older drawings were removed." : "Saved to your gallery! 🎨");
  };

  const download = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const a = document.createElement("a");
    a.href = makeFullImage(cv);
    a.download = `talia-drawing-${Date.now()}.png`;
    a.click();
    flash("Saved to your downloads ⬇️");
  };

  const openSaved = (id: string) => {
    const s = gallery.find((g) => g.id === id);
    if (!s) return;
    window.open(s.thumb, "_blank", "noopener");
  };

  const removeSaved = (id: string) => setGallery(deleteSketch(window.localStorage, id));

  const flash = (msg: string) => {
    setNotice(msg);
    // Clear the previous notice's timer first, or a quick second flash would
    // be wiped early by the first one still counting down. Storing the handle
    // also lets unmount cancel it instead of firing into a dead component.
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2600);
  };

  // A timer set just before unmount would otherwise fire into a dead component.
  useEffect(() => () => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
  }, []);

  const usedHistory = Math.max(0, history);

  return (
    <div>
      <div
        className="rounded-2xl px-3 py-2.5"
        style={{ background: "linear-gradient(120deg, rgba(56,189,248,0.14), rgba(251,191,36,0.12))" }}
      >
        <div className="text-[12.5px] font-extrabold" style={{ color: "var(--text)" }}>
          🎨 Sketch pad
        </div>
        <p className="mt-0.5 text-[11px] font-semibold leading-snug" style={{ color: "var(--text-faint)" }}>
          Draw with your finger, the mouse, or a stylus. Everything stays on this computer — no account, no upload,
          works with the internet off.
        </p>
      </div>

      {/* canvas */}
      <div ref={wrapRef} className="mt-2.5 overflow-hidden rounded-2xl" style={{ boxShadow: "inset 0 0 0 1px var(--border)" }}>
        <canvas
          ref={canvasRef}
          className="block touch-none"
          style={{ background: "#fff", cursor: "crosshair" }}
          aria-label="Drawing canvas — draw with a finger, mouse or stylus"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
        />
      </div>

      {notice && (
        <div className="mt-2 text-center text-[11px] font-extrabold" style={{ color: "var(--accent)" }}>
          {notice}
        </div>
      )}

      {/* tools */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            title={t.hint}
            aria-pressed={tool === t.id}
            className="flex h-11 items-center gap-1.5 rounded-2xl px-2.5 text-[11px] font-extrabold transition active:scale-95"
            style={
              tool === t.id
                ? { background: "var(--accent-grad)", color: "#fff" }
                : { background: "var(--surface-strong)", color: "var(--text-soft)" }
            }
          >
            <span className="text-base leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* colours */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => {
              setColor(c);
              if (tool === "eraser") setTool("marker");
            }}
            aria-label={`Colour ${c}`}
            aria-pressed={color === c && tool !== "eraser"}
            className="h-8 w-8 rounded-full transition active:scale-90"
            style={{
              background: c,
              boxShadow: color === c && tool !== "eraser" ? `0 0 0 3px var(--surface-strong), 0 0 0 5px ${c}` : "none",
            }}
          />
        ))}
      </div>

      {/* size + stickers */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSize((s) => SIZES[Math.max(0, SIZES.indexOf(s) - 1)])}
            className="rounded-full p-1.5"
            style={{ background: "var(--surface-strong)", color: "var(--text-soft)" }}
            aria-label="Thinner"
          >
            <Minus size={12} />
          </button>
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ background: "var(--surface-strong)" }}
            title={`Brush size ${size}`}
          >
            <span
              className="rounded-full"
              style={{ width: Math.max(3, Math.min(18, size)), height: Math.max(3, Math.min(18, size)), background: color }}
            />
          </span>
          <button
            onClick={() => setSize((s) => SIZES[Math.min(SIZES.length - 1, SIZES.indexOf(s) + 1)])}
            className="rounded-full p-1.5"
            style={{ background: "var(--surface-strong)", color: "var(--text-soft)" }}
            aria-label="Thicker"
          >
            <Plus size={12} />
          </button>
        </div>

        {tool === "stamp" && (
          <div className="flex flex-wrap gap-1">
            {STAMPS.map((s) => (
              <button
                key={s}
                onClick={() => setStamp(s)}
                aria-pressed={stamp === s}
                className="h-8 w-8 rounded-full text-base transition active:scale-90"
                style={{ background: stamp === s ? "var(--accent-grad)" : "var(--surface-strong)" }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* actions */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button
          onClick={undo}
          disabled={!usedHistory}
          className="flex h-10 items-center gap-1.5 rounded-2xl px-3 text-[11px] font-extrabold disabled:opacity-35"
          style={{ background: "var(--surface-strong)", color: "var(--text-soft)" }}
        >
          <Undo2 size={13} /> Undo
        </button>
        <button
          onClick={redoStep}
          disabled={!redo}
          className="flex h-10 items-center gap-1.5 rounded-2xl px-3 text-[11px] font-extrabold disabled:opacity-35"
          style={{ background: "var(--surface-strong)", color: "var(--text-soft)" }}
        >
          <Redo2 size={13} /> Redo
        </button>
        <button
          onClick={clearAll}
          disabled={!usedHistory}
          className="flex h-10 items-center gap-1.5 rounded-2xl px-3 text-[11px] font-extrabold disabled:opacity-35"
          style={{ background: "var(--surface-strong)", color: "var(--text-soft)" }}
        >
          <Eraser size={13} /> Clear
        </button>
        <div className="flex-1" />
        <button
          onClick={save}
          className="flex h-10 items-center gap-1.5 rounded-2xl px-3 text-[11px] font-extrabold text-white shadow-plush"
          style={{ background: "var(--accent-grad)" }}
        >
          <Shapes size={13} /> Save
        </button>
        <button
          onClick={download}
          className="flex h-10 items-center gap-1.5 rounded-2xl px-3 text-[11px] font-extrabold"
          style={{ background: "var(--surface-strong)", color: "var(--text-soft)" }}
        >
          <Download size={13} /> PNG
        </button>
      </div>

      {/* gallery */}
      {gallery.length > 0 && (
        <>
          <h4 className="mt-4 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Your gallery ({gallery.length}/{MAX_SKETCHES})
          </h4>
          <div className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {gallery.map((g) => (
              <div key={g.id} className="group relative overflow-hidden rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--border)" }}>
                <button onClick={() => openSaved(g.id)} className="block w-full" title="Open bigger">
                  <img src={g.thumb} alt="Saved drawing" className="block w-full" />
                </button>
                <button
                  onClick={() => removeSaved(g.id)}
                  className="absolute right-1 top-1 rounded-full p-1 text-white"
                  style={{ background: "rgba(0,0,0,0.5)" }}
                  aria-label="Delete this drawing"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-[10px] font-bold" style={{ color: "var(--text-faint)" }}>
            <ImageDown size={11} /> The gallery keeps small copies to save space — use PNG for the full-size one.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/** Lay down one freehand segment — cheap, called on every pointermove. */
function paintSegment(ctx: CanvasRenderingContext2D, s: Stroke) {
  const pts = s.points;
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const br = brushFor(s.tool);
  ctx.globalAlpha = br.alpha;
  ctx.strokeStyle = s.tool === "eraser" ? "#ffffff" : s.color;
  ctx.lineWidth = s.size * br.scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  if (br.rough) {
    // Crayon: a couple of offset passes so the line looks toothy.
    ctx.stroke();
    ctx.globalAlpha = br.alpha * 0.4;
    ctx.lineWidth = s.size * 0.5 * br.scale;
    ctx.beginPath();
    ctx.moveTo(a.x + 0.6, a.y - 0.6);
    ctx.lineTo(b.x + 0.6, b.y - 0.6);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Redraw a finished stroke from scratch (shapes and undo both need this). */
function paintStroke(ctx: CanvasRenderingContext2D | null, s: Stroke, _live: boolean) {
  if (!ctx) return;
  const br = brushFor(s.tool);
  ctx.strokeStyle = s.tool === "eraser" ? "#ffffff" : s.color;
  ctx.globalAlpha = br.alpha;
  ctx.lineWidth = s.size * br.scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (s.tool === "line") {
    ctx.beginPath();
    ctx.moveTo(s.from!.x, s.from!.y);
    ctx.lineTo(s.points[s.points.length - 1].x, s.points[s.points.length - 1].y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  if (s.tool === "rect") {
    const b = s.points[s.points.length - 1];
    ctx.strokeRect(s.from!.x, s.from!.y, b.x - s.from!.x, b.y - s.from!.y);
    ctx.globalAlpha = 1;
    return;
  }
  if (s.tool === "circle") {
    const b = s.points[s.points.length - 1];
    const cx = (s.from!.x + b.x) / 2;
    const cy = (s.from!.y + b.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.abs(b.x - s.from!.x) / 2, Math.abs(b.y - s.from!.y) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  if (s.tool === "stamp") {
    ctx.save();
    ctx.font = "34px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s.glyph ?? "⭐", s.points[0].x, s.points[0].y);
    ctx.restore();
    return;
  }

  for (let i = 1; i < s.points.length; i++) paintSegment(ctx, { ...s, points: [s.points[i - 1], s.points[i]] });
  if (s.points.length === 1) {
    const p = s.points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, (s.size * br.scale) / 2, 0, Math.PI * 2);
    ctx.fillStyle = s.tool === "eraser" ? "#ffffff" : s.color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** While dragging a shape, show it lightly so the child can aim. */
function previewShape(ctx: CanvasRenderingContext2D, s: Stroke) {
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.setLineDash([5, 4]);
  paintStroke(ctx, s, true);
  ctx.restore();
}

export const SKETCH_TOOLS = TOOLS;
export const SKETCH_COLORS = COLORS;