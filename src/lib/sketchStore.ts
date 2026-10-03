// Where a kid's drawings live.
//
// The obvious thing to do is shove full-size PNGs into localStorage, and that
// works right up until a child has saved eight pictures and the whole app
// starts throwing on write. Browsers give localStorage about 5 MB, and a single
// 900x600 PNG is easy 200 KB of base64.
//
// So the gallery deliberately stores *thumbnails* and keeps the full-size image
// only in memory for downloading. A 240px JPEG thumbnail is roughly 4 KB, which
// means a hundred drawings still fit — and nobody has ever noticed that the
// picture in the gallery is smaller than the one they saved, because the
// full-resolution original is what gets downloaded.
//
// Everything here is pure-ish: the storage functions take a `Storage` so tests
// can hand in a fake, and nothing touches the DOM.

export interface Sketch {
  id: string;
  /** Small JPEG data URL for the gallery grid. */
  thumb: string;
  /** ISO date, so the gallery can say "Tuesday" without a date library. */
  createdAt: string;
}

export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = "talia-ai:sketches:v1";

/** How many drawings to keep. Oldest go first once this is hit. */
export const MAX_SKETCHES = 60;

export function newSketchId(now: number, seed: number): string {
  return `sk-${now.toString(36)}-${seed.toString(36)}`;
}

/** Parse whatever is in storage, discarding anything malformed. */
export function parseSketches(raw: string | null): Sketch[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isSketch).slice(0, MAX_SKETCHES);
}

function isSketch(v: unknown): v is Sketch {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.thumb === "string" &&
    s.thumb.startsWith("data:image/") &&
    typeof s.createdAt === "string"
  );
}

export function loadSketches(store: Store): Sketch[] {
  try {
    return parseSketches(store.getItem(KEY));
  } catch {
    // Private browsing and some locked-down webviews throw on read.
    return [];
  }
}

/**
 * Add one drawing, newest first.
 *
 * Returns what ended up in the gallery, and whether anything had to go to make
 * room. If the write still fails — quota exceeded, storage disabled — the old
 * list is returned untouched rather than the gallery appearing to empty itself.
 */
export function saveSketch(
  store: Store,
  sketch: Sketch,
): { sketches: Sketch[]; dropped: number; failed: boolean } {
  const existing = loadSketches(store).filter((s) => s.id !== sketch.id);
  const next = [sketch, ...existing].slice(0, MAX_SKETCHES);
  const dropped = existing.length + 1 - next.length;
  try {
    store.setItem(KEY, JSON.stringify(next));
    return { sketches: next, dropped, failed: false };
  } catch {
    // Out of room. Give up the oldest drawings one at a time and try again.
    for (let keep = next.length - 1; keep > 0; keep -= 5) {
      const trimmed = next.slice(0, keep);
      try {
        store.setItem(KEY, JSON.stringify(trimmed));
        return { sketches: trimmed, dropped: next.length - keep, failed: false };
      } catch {
        /* still full — keep trimming */
      }
    }
    return { sketches: loadSketches(store), dropped, failed: true };
  }
}

export function deleteSketch(store: Store, id: string): Sketch[] {
  const next = loadSketches(store).filter((s) => s.id !== id);
  try {
    store.setItem(KEY, JSON.stringify(next));
  } catch {
    /* nothing useful to do — the row stays until the next successful write */
  }
  return next;
}

// ---------------------------------------------------------------------------
// Canvas helpers — the parts worth testing without a browser
// ---------------------------------------------------------------------------

/** A stable-ish id without pulling in a uuid dependency. */
export function makeId(): string {
  return `sk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Downscale a drawing to a small JPEG for the gallery.
 *
 * Passing `quality` under 1 is what keeps this small; at full quality a
 * thumbnail is no cheaper than the original and the whole point is lost.
 */
export function makeThumb(canvas: HTMLCanvasElement, max = 240, quality = 0.6): string {
  const scale = Math.min(1, max / Math.max(1, canvas.width));
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(canvas, 0, 0, w, h);
  return tmp.toDataURL("image/jpeg", quality);
}

/** Full-size PNG, for the download button. */
export function makeFullImage(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

/** Nudge a filename into something safe for a download attribute. */
export function safeFileName(name: string): string {
  const clean = name.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-");
  return `${clean || "drawing"}.png`;
}