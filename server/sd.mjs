// 🎨 Talia's built-in image engine — stable-diffusion.cpp, zero drivers.
//
// Same story as the chat runtime: on demand, Talia downloads the official
// stable-diffusion.cpp build for this platform (CPU + Metal/Vulkan, no CUDA,
// no admin rights), unpacks it with the OS's own tools, fetches a small GGUF
// image model, and renders images with the `sd-cli` binary per request.
//
// Everything lives under <dataDir>/sd-runtime and <dataDir>/sd-models —
// delete those two folders and nothing is left behind.
//
// Why per-request sd-cli instead of a managed sd-server daemon: the server
// build bakes steps/size into boot flags and ignores per-request params, so
// the CLI is the only way to honor the Studio's Draft/Fine/Max presets. Each
// render is a short-lived child process — nothing lingers between requests.

import { createWriteStream, existsSync, mkdirSync, chmodSync, readdirSync, renameSync, statSync, rmSync, readFileSync, unlinkSync, openSync, readSync, closeSync } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { dataDir, readCollection, writeCollection } from "./store.mjs";

const execFileAsync = promisify(execFile);

export const SD_REPO = "leejet/stable-diffusion.cpp";
const SD_DIR = join(dataDir, "sd-runtime");
const SD_MODELS_DIR = join(dataDir, "sd-models");

// ---------- platform support (pure, unit-tested) ------------------------------
export function sdTargetFor(platform, arch) {
  if (platform === "darwin" && arch === "arm64") return { asset: "Darwin-macOS", label: "macOS · Apple Silicon", accelerator: "Metal GPU + CPU" };
  if (platform === "darwin" && arch === "x64") return { asset: null, label: "macOS · Intel", accelerator: null }; // upstream ships no Intel macOS build
  if (platform === "linux" && arch === "x64") return { asset: "Linux-Ubuntu-24.04-x86_64", label: "Linux · x64", accelerator: "CPU (AVX2)" };
  if (platform === "linux" && arch === "arm64") return { asset: null, label: "Linux · ARM64", accelerator: null }; // upstream ships no Linux ARM build
  if (platform === "win32" && arch === "x64") return { asset: "win-cpu-x64", label: "Windows · x64", accelerator: "CPU (no GPU drivers needed)" };
  return null;
}

/** Pick the right sd release asset for a target from a GitHub assets[] list. */
export function sdAssetFor(assets, target) {
  // Segment boundary: the asset name may continue after the target (e.g.
  // "...-bin-Darwin-macOS-26.6.2-arm64.zip"), so don't require a dot right after.
  const wanted = `-bin-${target.asset}`;
  const matches = (assets ?? []).filter(
    (a) => typeof a?.name === "string" && a.name.startsWith("sd-") && a.name.includes(wanted) && a.name.endsWith(".zip"),
  );
  // Prefer the plain build over vulkan/rocm/cuda variants when several match.
  return matches.find((a) => !/vulkan|rocm|cuda/i.test(a.name)) ?? matches[0] ?? null;
}

// ---------- image model catalog (GGUF, unit-tested shapes) ----------------------
export const SD_MODELS = [
  {
    id: "sd-turbo",
    name: "SD Turbo",
    size: "~2.0 GB",
    sizeBytes: 2_023_745_376,
    blurb: "1-step snapshots in seconds — fast and fun on any Apple Silicon or modern CPU.",
    repo: "Green-Sky/SD-Turbo-GGUF",
    file: "sd_turbo-f16-q8_0.gguf",
    // Turbo models must run with cfg 1.0 (they have no negative-prompt branch);
    // max is pinned to 1.0 so every Studio preset clamps to exactly 1.0.
    steps: { min: 1, max: 8, fallback: 4 },
    cfg: { min: 1, max: 1.0, fallback: 1.0 },
    recommended: true,
  },
  {
    id: "sd15-q8",
    name: "Stable Diffusion 1.5",
    size: "~1.8 GB",
    sizeBytes: 1_763_578_176,
    blurb: "The classic — follows prompts closely, loves 20–40 steps, honors negatives.",
    repo: "second-state/stable-diffusion-v1-5-GGUF",
    file: "stable-diffusion-v1-5-pruned-emaonly-Q8_0.gguf",
    steps: { min: 8, max: 80, fallback: 24 },
    cfg: { min: 1, max: 14, fallback: 7 },
    recommended: false,
  },
  {
    id: "sd15-q4",
    name: "SD 1.5 (compact)",
    size: "~1.6 GB",
    sizeBytes: 1_566_768_416,
    blurb: "Lighter sibling for tight disks — same classic look, slightly softer detail.",
    repo: "second-state/stable-diffusion-v1-5-GGUF",
    file: "stable-diffusion-v1-5-pruned-emaonly-Q4_0.gguf",
    steps: { min: 8, max: 80, fallback: 24 },
    cfg: { min: 1, max: 14, fallback: 7 },
    recommended: false,
  },
];

export function sdModelUrl(m) {
  return `https://huggingface.co/${m.repo}/resolve/main/${m.file}?download=true`;
}

/** RAM (GB) a model is comfortable in — image gen peaks well above file size. */
export function recommendedSdModel(ramGB) {
  if (ramGB >= 8) return "sd-turbo";
  return "sd15-q4"; // the classic tolerates low RAM gracefully with tiling
}

// ---------- install state -------------------------------------------------------
const config = () => readCollection("sd-runtime", { selectedModel: "sd-turbo", sdVersion: null });

let queueTail = Promise.resolve();
let rendersInFlight = 0;

function sdBinary() {
  if (!existsSync(SD_DIR)) return null;
  const versions = readdirSync(SD_DIR).filter((d) => {
    try {
      return statSync(join(SD_DIR, d)).isDirectory();
    } catch {
      return false;
    }
  });
  for (const v of versions) {
    const found = findBinary(join(SD_DIR, v));
    if (found) return { path: found, version: v };
  }
  return null;
}

function findBinary(dir, depth = 0) {
  if (depth > 4) return null;
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const e of entries) {
    const p = join(dir, e);
    try {
      const st = statSync(p);
      if (st.isFile() && (e === "sd-cli" || e === "sd-cli.exe")) return p;
      if (st.isDirectory()) {
        const nested = findBinary(p, depth + 1);
        if (nested) return nested;
      }
    } catch {
      /* skip unreadable */
    }
  }
  return null;
}

// ---------- network helpers (mirrors runtime.mjs) --------------------------------
async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "talia-ai", Accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error(`GitHub responded ${r.status}`);
  return r.json();
}

export async function latestSdRelease() {
  // The repo's newest release tags track master builds and always ship
  // binaries, but /releases/latest can lag — scan a small window instead.
  const rels = await fetchJson(`https://api.github.com/repos/${SD_REPO}/releases?per_page=10`);
  if (!Array.isArray(rels)) throw new Error("Unexpected GitHub response");
  const target = sdTargetFor(process.platform, process.arch);
  if (target?.asset) {
    const usable = rels.find((rel) => sdAssetFor(rel.assets ?? [], target));
    if (usable) return { tag: usable.tag_name, assets: usable.assets ?? [] };
  }
  const any = rels.find((rel) => (rel.assets ?? []).some((a) => /^sd-.*-bin-/.test(String(a?.name ?? ""))));
  if (any) return { tag: any.tag_name, assets: any.assets ?? [] };
  throw new Error("No image engine release with prebuilt binaries found.");
}

/** Stream a URL to a file, reporting progress. Returns the archive path. */
async function downloadTo(url, dest, onProgress) {
  const res = await fetch(url, { headers: { "User-Agent": "talia-ai" }, redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
  const total = Number(res.headers.get("content-length") || 0);
  mkdirSync(join(dest, ".."), { recursive: true });
  const part = `${dest}.part`;
  const out = createWriteStream(part);
  let received = 0;
  let lastTick = 0;
  const stream = Readable.fromWeb(res.body);
  stream.on("data", (chunk) => {
    received += chunk.length;
    const now = Date.now();
    if (now - lastTick > 250) {
      lastTick = now;
      onProgress?.({ received, total, pct: total ? Math.round((received / total) * 100) : null });
    }
  });
  await new Promise((resolve, reject) => {
    stream.pipe(out);
    out.on("finish", resolve);
    out.on("error", reject);
    stream.on("error", reject);
  });
  if (received && total && received < total * 0.95) {
    rmSync(part, { force: true });
    throw new Error(`Download truncated (${received} of ${total} bytes)`);
  }
  // CDN redirects sometimes omit content-length; a truncated file would fail
  // cryptically later, so sanity-check magic bytes up front.
  const head = Buffer.alloc(4);
  const fd = openSync(part, "r");
  try {
    readSync(fd, head, 0, 4, 0);
  } finally {
    closeSync(fd);
  }
  if (dest.endsWith(".gguf") && !head.equals(Buffer.from("GGUF"))) {
    rmSync(part, { force: true });
    throw new Error("Downloaded file is not a valid GGUF model — retry the download.");
  }
  renameSync(part, dest);
  onProgress?.({ received, total: total || received, pct: 100 });
  return dest;
}

/** Extract an archive using the OS's own tools — no bundled unpackers. */
async function extract(archive, dest) {
  mkdirSync(dest, { recursive: true });
  const attempts = archive.endsWith(".zip")
    ? [["tar", ["-xf", archive, "-C", dest]], ["unzip", ["-o", archive, "-d", dest]], ["python3", ["-m", "zipfile", "-e", archive, dest]]]
    : [["tar", ["-xzf", archive, "-C", dest]]];
  let lastErr = null;
  for (const [cmd, args] of attempts) {
    try {
      await execFileAsync(cmd, args, { maxBuffer: 16 * 1024 * 1024 });
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Could not unpack the engine (${lastErr?.message ?? "no extractor found"}). Install "unzip" or "tar" and retry.`);
}

function makeExecutable(dir) {
  const walk = (d, depth = 0) => {
    if (depth > 4) return;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, depth + 1);
      else if (/sd-cli(\.exe)?$/.test(e) || /\.(dylib|so)$/.test(e) || /\.(dll)$/.test(e)) {
        try {
          chmodSync(p, 0o755);
        } catch {
          /* Windows ignores modes */
        }
      }
    }
  };
  try {
    walk(dir);
  } catch {
    /* best effort */
  }
}

// ---------- install / update ------------------------------------------------------
export async function installSdRuntime({ force = false, onProgress } = {}) {
  const target = sdTargetFor(process.platform, process.arch);
  if (!target) {
    return { ok: false, error: `Talia's image engine doesn't have a build for ${process.platform}/${process.arch} yet — point Media Studio at Automatic1111 or any OpenAI-style image server instead.` };
  }
  if (!target.asset) {
    return { ok: false, error: `${target.label} has no image engine build yet (upstream ships none) — point Media Studio at Automatic1111 or an OpenAI-style image server instead.` };
  }
  const installed = sdBinary();
  const cfg = await config();
  try {
    onProgress?.({ phase: "check", message: "Checking the latest image engine…" });
    const rel = await latestSdRelease();
    const asset = sdAssetFor(rel.assets, target);
    if (!asset) return { ok: false, error: `No release asset found for ${target.label} in ${rel.tag}.` };
    if (!force && installed && installed.version === rel.tag) {
      return { ok: true, version: rel.tag, alreadyCurrent: true };
    }
    onProgress?.({ phase: "download", message: `Downloading ${target.label} image engine (${rel.tag})…`, pct: 0 });
    const archivePath = join(SD_DIR, asset.name);
    await downloadTo(asset.browser_download_url, archivePath, (p) => onProgress?.({ phase: "download", message: `Downloading engine… ${p.pct ?? 0}%`, ...p }));
    onProgress?.({ phase: "extract", message: "Unpacking…" });
    const dest = join(SD_DIR, rel.tag);
    rmSync(dest, { recursive: true, force: true });
    await extract(archivePath, dest);
    makeExecutable(dest);
    rmSync(archivePath, { force: true });
    const found = findBinary(dest);
    if (!found) return { ok: false, error: "Unpacked the engine but couldn't find sd-cli inside it." };
    // Keep only the newest version folder around.
    for (const d of readdirSync(SD_DIR)) {
      if (d !== rel.tag && statSync(join(SD_DIR, d)).isDirectory()) {
        rmSync(join(SD_DIR, d), { recursive: true, force: true });
      }
    }
    writeCollection("sd-runtime", { ...cfg, sdVersion: rel.tag });
    onProgress?.({ phase: "done", message: `Image engine ${rel.tag} ready — no drivers needed ✓`, pct: 100 });
    return { ok: true, version: rel.tag };
  } catch (err) {
    return { ok: false, error: `Image engine install failed: ${err.message}` };
  }
}

// ---------- models ------------------------------------------------------------------
export function sdModelPath(id) {
  const m = SD_MODELS.find((x) => x.id === id);
  if (!m) return null;
  const p = join(SD_MODELS_DIR, m.file);
  if (!p.startsWith(SD_MODELS_DIR)) return null;
  return p;
}

export async function downloadSdModel(id, onProgress) {
  const m = SD_MODELS.find((x) => x.id === id);
  if (!m) return { ok: false, error: "Unknown image model." };
  const dest = sdModelPath(id);
  if (!dest) return { ok: false, error: "Bad model path." };
  try {
    if (existsSync(dest) && statSync(dest).size > m.sizeBytes * 0.8) {
      return { ok: true, alreadyDownloaded: true };
    }
    onProgress?.({ phase: "download", message: `Downloading ${m.name} (${m.size})…`, pct: 0 });
    await downloadTo(sdModelUrl(m), dest, (p) => onProgress?.({ phase: "download", message: `Downloading ${m.name}… ${p.pct ?? 0}%`, ...p }));
    onProgress?.({ phase: "done", message: `${m.name} ready ✓`, pct: 100 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Model download failed: ${err.message}` };
  }
}

export function deleteSdModel(id) {
  const p = sdModelPath(id);
  if (!p || !existsSync(p)) return false;
  rmSync(p, { force: true });
  return true;
}

// ---------- uninstall (clean removal) -------------------------------------------------
export async function uninstallSdRuntime() {
  const hadEngine = !!sdBinary();
  const hadModels = existsSync(SD_MODELS_DIR);
  try {
    if (existsSync(SD_DIR)) rmSync(SD_DIR, { recursive: true, force: true });
    if (existsSync(SD_MODELS_DIR)) rmSync(SD_MODELS_DIR, { recursive: true, force: true });
    writeCollection("sd-runtime", { selectedModel: "sd-turbo", sdVersion: null });
    return { ok: true, hadEngine, hadModels };
  } catch (err) {
    return { ok: false, error: `Uninstall failed: ${err.message}` };
  }
}

// ---------- status ----------------------------------------------------------------------
export async function sdStatus() {
  const target = sdTargetFor(process.platform, process.arch);
  const bin = sdBinary();
  const cfg = await config();
  const ramGB = Math.round(os.totalmem() / 1024 ** 3);
  const defaultModel = recommendedSdModel(ramGB);
  return {
    platform: process.platform,
    arch: process.arch,
    supported: !!target?.asset,
    targetLabel: target?.label ?? `${process.platform}/${process.arch}`,
    accelerator: target?.accelerator ?? null,
    installed: !!bin,
    version: bin?.version ?? null,
    selectedModel: cfg.selectedModel ?? defaultModel,
    models: SD_MODELS.map((m) => {
      const p = sdModelPath(m.id);
      const downloaded = !!p && existsSync(p);
      return { id: m.id, name: m.name, size: m.size, sizeBytes: m.sizeBytes, blurb: m.blurb, recommended: !!m.recommended, downloaded, bytes: downloaded ? statSync(p).size : 0 };
    }),
    busy: rendersInFlight > 0,
    recommendedModel: defaultModel,
  };
}

// ---------- generation ------------------------------------------------------------------
const NEGATIVE_DEFAULT = "lowres, blurry, watermark, jpeg artifacts, bad anatomy";

function clampFor(m, { steps, cfg }) {
  const s = Math.min(m.steps.max, Math.max(m.steps.min, Math.round(Number(steps) || m.steps.fallback)));
  const c = Math.min(m.cfg.max, Math.max(m.cfg.min, Number(cfg) || m.cfg.fallback));
  return { steps: s, cfg: c };
}

/**
 * Render one image with sd-cli. Resolves a data URL on success. Each call is
 * its own short-lived process; renders are serialized so only one runs at a
 * time (the engine peaks at several GB of RAM).
 */
export async function generateLocalImage({ prompt, negative, steps, cfg, width, height, seed, modelId }, onProgress) {
  const bin = sdBinary();
  if (!bin) return { ok: false, error: "Talia's image engine isn't installed yet — press Install image engine first." };
  const sdCfg = config();
  const m = SD_MODELS.find((x) => x.id === (modelId || sdCfg.selectedModel || "sd-turbo")) ?? SD_MODELS[0];
  const mp = sdModelPath(m.id);
  if (!mp || !existsSync(mp)) {
    return { ok: false, error: `${m.name} isn't downloaded yet — grab it in Media Studio first.`, needsModel: m.id };
  }
  const clamped = clampFor(m, { steps, cfg });
  const w = Math.min(1536, Math.max(256, Number(width) || 512));
  const h = Math.min(1536, Math.max(256, Number(height) || 512));

  const run = async () => {
    const outPath = join(SD_MODELS_DIR, `render-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
    const args = [
      "-m", mp,
      "-p", String(prompt ?? ""),
      "-n", String(negative || NEGATIVE_DEFAULT),
      "--steps", String(clamped.steps),
      "--cfg-scale", String(clamped.cfg),
      "-W", String(w),
      "-H", String(h),
      "-s", String(Number.isFinite(Number(seed)) && Number(seed) >= 0 ? Number(seed) : -1),
      "--vae-tiling",
      "-o", outPath,
    ];
    const started = Date.now();
    onProgress?.({ phase: "render", message: `Painting with ${m.name} (${clamped.steps} steps)…` });
    try {
      await execFileAsync(bin.path, args, { maxBuffer: 8 * 1024 * 1024, timeout: 15 * 60_000, windowsHide: true });
      if (!existsSync(outPath)) return { ok: false, error: "The engine finished but wrote no image — try fewer steps or a smaller size." };
      const buf = readFileSync(outPath);
      unlinkSync(outPath);
      onProgress?.({ phase: "done", message: `Painted in ${((Date.now() - started) / 1000).toFixed(1)}s ✓`, pct: 100 });
      return { ok: true, kind: "image", mime: "image/png", dataUrl: `data:image/png;base64,${buf.toString("base64")}`, backend: `talia-sd (${m.name})` };
    } catch (err) {
      try {
        unlinkSync(outPath);
      } catch {
        /* nothing to clean */
      }
      const msg = String(err?.message ?? err);
      if (/timeout|timed out/i.test(msg)) return { ok: false, error: "The render took too long and was stopped — try the Draft preset or a smaller size." };
      return { ok: false, error: `Image render failed: ${msg.slice(0, 200)}` };
    }
  };

  // True serialization: each render waits for the previous promise to settle.
  rendersInFlight++;
  const prev = queueTail;
  let release;
  queueTail = new Promise((r) => {
    release = r;
  });
  await prev;
  try {
    return await run();
  } finally {
    release();
    rendersInFlight--;
  }
}
