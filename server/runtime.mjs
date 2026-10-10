// 🧠 Talia Runtime — Talia's own built-in local AI engine.
//
// Zero drivers, zero external installs: on demand, Talia downloads the
// official llama.cpp CPU/Metal build for the user's platform (no CUDA, no
// admin rights), unpacks it with the OS's built-in `tar`, fetches a small
// GGUF model, and runs `llama-server` as a managed child process exposing an
// OpenAI-compatible API on 127.0.0.1:11435.
//
// Everything lives under <dataDir>/runtime and <dataDir>/models so a single
// folder is the whole story: delete it and nothing is left behind.

import { createWriteStream, existsSync, mkdirSync, chmodSync, readdirSync, statSync, rmSync, renameSync } from "node:fs";
import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import os from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { dataDir, readCollection, writeCollection } from "./store.mjs";
import { isOffline, offlineError } from "./settings.mjs";

const execFileAsync = promisify(execFile);

export const RUNTIME_PORT = 11435;
export const RUNTIME_BASE_URL = `http://127.0.0.1:${RUNTIME_PORT}/v1`;
const LLAMA_REPO = "ggml-org/llama.cpp";
const RUNTIME_DIR = join(dataDir, "runtime");
const MODELS_DIR = join(dataDir, "models");

// ---------- platform support (pure, unit-tested) ------------------------------
export function targetFor(platform, arch) {
  if (platform === "darwin" && arch === "arm64") return { asset: "macos-arm64", label: "macOS · Apple Silicon", accelerator: "Metal GPU + CPU" };
  if (platform === "darwin" && arch === "x64") return { asset: "macos-x64", label: "macOS · Intel", accelerator: "CPU (AVX2)" };
  if (platform === "linux" && arch === "x64") return { asset: "ubuntu-x64", label: "Linux · x64", accelerator: "CPU (AVX2)" };
  if (platform === "linux" && arch === "arm64") return { asset: "ubuntu-arm64", label: "Linux · ARM64", accelerator: "CPU" };
  if (platform === "win32" && arch === "x64") return { asset: "win-avx2-x64", label: "Windows · x64", accelerator: "CPU (AVX2)" };
  return null;
}

/** Pick the right release asset for a target from a GitHub release assets[] list. */
export function assetFor(assets, target) {
  const wanted = `-bin-${target.asset}.`;
  const matches = (assets ?? []).filter((a) => typeof a?.name === "string" && a.name.includes(wanted) && (a.name.endsWith(".zip") || a.name.endsWith(".tar.gz")));
  // Prefer .zip (bsdtar on macOS/Windows, unzip fallback on Linux), then .tar.gz.
  return matches.find((a) => a.name.endsWith(".zip")) ?? matches.find((a) => a.name.endsWith(".tar.gz")) ?? null;
}

/** Compare a llama.cpp build tag ("b6720") or app version ("v0.3.1") numerically. */
export function parseVersion(v) {
  const m = String(v ?? "").match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

export function isNewer(candidate, current) {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

// ---------- GGUF model catalog -------------------------------------------------
// Every repo/file below was verified reachable WITHOUT Hugging Face auth (a
// gated repo would stall an unattended install), and sizeBytes is the exact
// Content-Length of the Q4_K_M file — so download progress and the "does it
// fit" checks are honest.
export const GGUF_MODELS = [
  {
    id: "qwen2.5-0.5b",
    name: "Qwen 2.5 0.5B",
    size: "~470 MB",
    sizeBytes: 491_400_032,
    blurb: "Featherweight and instant — great on any laptop.",
    repo: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
    file: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    recommended: false,
  },
  {
    id: "llama-3.2-1b",
    name: "Llama 3.2 1B",
    size: "~770 MB",
    sizeBytes: 807_694_464,
    blurb: "Meta's tiniest — friendlier voice than its size suggests.",
    repo: "bartowski/Llama-3.2-1B-Instruct-GGUF",
    file: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    recommended: false,
  },
  {
    id: "qwen2.5-1.5b",
    name: "Qwen 2.5 1.5B",
    size: "~1.1 GB",
    sizeBytes: 1_117_320_736,
    blurb: "The sweet spot — smart enough for chat, small enough for anything.",
    repo: "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
    file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    recommended: true,
  },
  {
    id: "llama-3.2-3b",
    name: "Llama 3.2 3B",
    size: "~1.9 GB",
    sizeBytes: 2_019_377_696,
    blurb: "Meta's chatty 3B — friendly personality, needs ~5 GB RAM.",
    repo: "bartowski/Llama-3.2-3B-Instruct-GGUF",
    file: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    recommended: false,
  },
  {
    id: "qwen2.5-3b",
    name: "Qwen 2.5 3B",
    size: "~2.0 GB",
    sizeBytes: 2_104_932_768,
    blurb: "Noticeably brighter, still comfortable on 8 GB RAM.",
    repo: "Qwen/Qwen2.5-3B-Instruct-GGUF",
    file: "qwen2.5-3b-instruct-q4_k_m.gguf",
    recommended: false,
  },
  {
    id: "qwen3-4b-instruct-2507",
    name: "Qwen 3 4B (Instruct 2507)",
    size: "~2.3 GB",
    sizeBytes: 2_497_280_736,
    blurb: "The sharpest brain in the starter lineup — a 2025 model that punches far above its size.",
    repo: "bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF",
    file: "Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
    recommended: false,
  },
];

export function modelUrl(m) {
  return `https://huggingface.co/${m.repo}/resolve/main/${m.file}?download=true`;
}

// ---------- hardware-aware brain picker (inspired by ODS tiering) --------------
// Minimum RAM (GB) each brain is comfortable in, model + KV cache headroom.
const RAM_NEEDS_GB = {
  "qwen3-4b-instruct-2507": 8,
  "qwen2.5-3b": 8,
  "llama-3.2-3b": 8,
  "llama-3.2-1b": 4,
  "qwen2.5-1.5b": 4,
  "qwen2.5-0.5b": 2,
};

/** Brightest brain that fits the machine's memory envelope. Pure + tested. */
export function recommendedBrain(ramGB) {
  const fits = GGUF_MODELS.filter((m) => ramGB >= (RAM_NEEDS_GB[m.id] ?? 99));
  if (fits.length === 0) return GGUF_MODELS[0].id; // featherweight fallback
  // 2507 = Qwen 3's refreshed instruct line — measurably smarter at the same
  // size, so it leads whenever there's room.
  const order = ["qwen3-4b-instruct-2507", "qwen2.5-3b", "llama-3.2-3b", "qwen2.5-1.5b", "llama-3.2-1b", "qwen2.5-0.5b"];
  for (const id of order) {
    if (fits.some((m) => m.id === id)) return id;
  }
  return GGUF_MODELS[0].id;
}


/** Friendly one-line description of this machine, for the UI. */
export function deviceLabel(platform, arch, ramGB) {
  const osName = platform === "darwin" ? "Mac" : platform === "win32" ? "Windows PC" : platform === "linux" ? "Linux box" : platform;
  const chip = platform === "darwin" && arch === "arm64" ? "Apple Silicon" : arch === "arm64" ? "ARM" : arch === "x64" ? "x64" : arch;
  return `${osName} · ${chip} · ${ramGB} GB memory`;
}

export function modelPath(id) {
  const m = GGUF_MODELS.find((x) => x.id === id);
  if (!m) return null;
  // The id comes from our own catalog — never from user input — but keep the
  // guard anyway so nothing can ever escape MODELS_DIR.
  const p = join(MODELS_DIR, m.file);
  if (!p.startsWith(MODELS_DIR)) return null;
  return p;
}

// ---------- install state -------------------------------------------------------
const config = () => readCollection("runtime", { selectedModel: "qwen2.5-1.5b", autoStart: true, runtimeVersion: null });

let child = null;
let starting = null;
let stopping = false;
let restarts = 0;
const logs = [];
let lastExit = null;

function log(line) {
  const text = String(line).trimEnd();
  if (!text) return;
  logs.push(text);
  if (logs.length > 80) logs.splice(0, logs.length - 80);
}

function runtimeRoot() {
  return RUNTIME_DIR;
}

function serverBinary() {
  // <runtimeDir>/<version>/... — search for llama-server recursively.
  if (!existsSync(RUNTIME_DIR)) return null;
  const versions = readdirSync(RUNTIME_DIR).filter((d) => statSync(join(RUNTIME_DIR, d)).isDirectory());
  for (const v of versions) {
    const found = findBinary(join(RUNTIME_DIR, v));
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
      if (st.isFile() && (e === "llama-server" || e === "llama-server.exe")) return p;
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

// ---------- network helpers ------------------------------------------------------
async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "talia-ai", Accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error(`GitHub responded ${r.status}`);
  return r.json();
}

export async function latestRuntimeRelease() {
  // NOTE: /releases/latest is wrong here — llama.cpp's newest "release" is
  // often a version tag with no binaries (e.g. v0.5.0), while the actual
  // engine builds live on b#### tags. Scan for the newest release that
  // actually ships a binary for this machine.
  const rels = await fetchJson(`https://api.github.com/repos/${LLAMA_REPO}/releases?per_page=30`);
  if (!Array.isArray(rels)) throw new Error("Unexpected GitHub response");
  const target = targetFor(process.platform, process.arch);
  if (target) {
    const usable = rels.find((rel) => assetFor(rel.assets ?? [], target));
    if (usable) return { tag: usable.tag_name, assets: usable.assets ?? [] };
  }
  const any = rels.find((rel) => (rel.assets ?? []).some((a) => /^llama-.*-bin-/.test(String(a?.name ?? ""))));
  if (any) return { tag: any.tag_name, assets: any.assets ?? [] };
  throw new Error("No engine release with prebuilt binaries found.");
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
  // Ensure llama-server and its libs are executable (zip/tar keep modes, but
  // some extractors on Windows/macOS do not).
  const walk = (d, depth = 0) => {
    if (depth > 4) return;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, depth + 1);
      else if (/llama-server(\.exe)?$/.test(e) || /\.(dylib|so)$/.test(e) || /\.(dll)$/.test(e)) {
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
export async function installRuntime({ force = false, onProgress } = {}) {
  const target = targetFor(process.platform, process.arch);
  if (!target) {
    return { ok: false, error: `Talia's built-in engine doesn't have a build for ${process.platform}/${process.arch} yet — use Ollama or a cloud provider on this device.` };
  }
  if (await isOffline()) {
    return { ok: false, error: offlineError("Installing Talia's engine") };
  }
  const installed = serverBinary();
  const cfg = await config();
  try {
    onProgress?.({ phase: "check", message: "Checking the latest engine…" });
    const rel = await latestRuntimeRelease();
    const asset = assetFor(rel.assets, target);
    if (!asset) return { ok: false, error: `No release asset found for ${target.label} in ${rel.tag}.` };
    if (!force && installed && installed.version === rel.tag) {
      return { ok: true, version: rel.tag, alreadyCurrent: true };
    }
    onProgress?.({ phase: "download", message: `Downloading ${target.label} engine (${rel.tag})…`, pct: 0 });
    const archivePath = join(RUNTIME_DIR, asset.name);
    await downloadTo(asset.browser_download_url, archivePath, (p) => onProgress?.({ phase: "download", message: `Downloading engine… ${p.pct ?? 0}%`, ...p }));
    onProgress?.({ phase: "extract", message: "Unpacking…" });
    const dest = join(RUNTIME_DIR, rel.tag);
    rmSync(dest, { recursive: true, force: true });
    await extract(archivePath, dest);
    makeExecutable(dest);
    rmSync(archivePath, { force: true });
    const found = findBinary(dest);
    if (!found) return { ok: false, error: "Unpacked the engine but couldn't find llama-server inside it." };
    // Keep only the newest version folder around.
    for (const d of readdirSync(RUNTIME_DIR)) {
      if (d !== rel.tag && statSync(join(RUNTIME_DIR, d)).isDirectory()) {
        rmSync(join(RUNTIME_DIR, d), { recursive: true, force: true });
      }
    }
    writeCollection("runtime", { ...cfg, runtimeVersion: rel.tag });
    onProgress?.({ phase: "done", message: `Engine ${rel.tag} ready — no drivers needed ✓`, pct: 100 });
    return { ok: true, version: rel.tag };
  } catch (err) {
    return { ok: false, error: `Engine install failed: ${err.message}` };
  }
}

// ---------- one-tap quickstart (chatting in ~2 minutes, ODS-style) --------------
/** Pure decision core: what does the quickstart need to do next? */
export function quickstartPlan(st) {
  const steps = [];
  if (!st.installed) steps.push("engine");
  const haveBrain = (st.models ?? []).some((m) => m.downloaded);
  if (!haveBrain) steps.push("model");
  if (!st.running) steps.push("start");
  return { steps, total: steps.length };
}

/**
 * Everything in one tap: install engine → download the brain that fits this
 * machine → start the server → verify a real completion. Each step is
 * skipped when already done, so it is safe to press again anytime.
 */
export async function quickstart({ onProgress } = {}) {
  const status = await runtimeStatus();
  const plan = quickstartPlan(status);
  const brain = recommendedBrain(os.totalmem() / 1024 ** 3);
  try {
    if (plan.steps.includes("engine")) {
      onProgress?.({ phase: "quickstart", message: "Step 1/3 — installing the engine (no drivers needed)…", step: "engine" });
      const r = await installRuntime({ onProgress });
      if (!r.ok) return { ok: false, error: r.error };
    }
    const fresh = await runtimeStatus();
    if (quickstartPlan(fresh).steps.includes("model")) {
      onProgress?.({ phase: "quickstart", message: `Step 2/3 — downloading the ${brain === "qwen2.5-3b" ? "bright" : "starter"} brain for your machine…`, step: "model" });
      const r = await downloadModel(brain, onProgress);
      if (!r.ok) return { ok: false, error: r.error };
    }
    if (quickstartPlan(await runtimeStatus()).steps.includes("start")) {
      onProgress?.({ phase: "quickstart", message: "Step 3/3 — waking Talia's engine up…", step: "start" });
      const r = await startRuntime({ modelId: brain });
      if (!r.ok) return { ok: false, error: r.error };
      // startRuntime falls back to an already-downloaded brain when the
      // recommended one isn't on disk — report what is actually running.
      return { ok: true, model: r.model ?? brain, baseUrl: RUNTIME_BASE_URL, installedNow: plan.total > 0 };
    }
    onProgress?.({ phase: "quickstart", message: "Checking Talia can really talk…", step: "verify" });
    const healthy = await fetch(`${RUNTIME_BASE_URL}/models`, { signal: AbortSignal.timeout(5000) }).then((r) => r.ok).catch(() => false);
    if (!healthy) return { ok: false, error: "Engine is up but not answering — check the runtime logs in Settings." };
    const final = await runtimeStatus();
    return { ok: true, model: final.selectedModel ?? brain, baseUrl: RUNTIME_BASE_URL, installedNow: plan.total > 0 };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------- uninstall (clean removal, ODS-style) ---------------------------------
export async function uninstallRuntime() {
  stopRuntime();
  const hadEngine = !!serverBinary();
  try {
    if (existsSync(RUNTIME_DIR)) rmSync(RUNTIME_DIR, { recursive: true, force: true });
    if (existsSync(MODELS_DIR)) rmSync(MODELS_DIR, { recursive: true, force: true });
    writeCollection("runtime", { selectedModel: "qwen2.5-1.5b", autoStart: true, runtimeVersion: null });
    return { ok: true, hadEngine, hadModels: true };
  } catch (err) {
    return { ok: false, error: `Uninstall failed: ${err.message}` };
  }
}

// ---------- models ------------------------------------------------------------------
export async function downloadModel(id, onProgress) {
  const m = GGUF_MODELS.find((x) => x.id === id);
  if (!m) return { ok: false, error: "Unknown model." };
  const dest = modelPath(id);
  if (!dest) return { ok: false, error: "Bad model path." };
  if (await isOffline()) {
    return { ok: false, error: offlineError("Downloading models") };
  }
  try {
    if (existsSync(dest) && statSync(dest).size > m.sizeBytes * 0.8) {
      return { ok: true, alreadyDownloaded: true };
    }
    onProgress?.({ phase: "download", message: `Downloading ${m.name} (${m.size})…`, pct: 0 });
    await downloadTo(modelUrl(m), dest, (p) => onProgress?.({ phase: "download", message: `Downloading ${m.name}… ${p.pct ?? 0}%`, ...p }));
    onProgress?.({ phase: "done", message: `${m.name} ready ✓`, pct: 100 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Model download failed: ${err.message}` };
  }
}

export function deleteModel(id) {
  const p = modelPath(id);
  if (!p || !existsSync(p)) return false;
  rmSync(p, { force: true });
  return true;
}

// ---------- process management --------------------------------------------------------
function apiUp() {
  return fetch(`http://127.0.0.1:${RUNTIME_PORT}/health`, { signal: AbortSignal.timeout(1500) })
    .then((r) => r.ok)
    .catch(() => false);
}

async function waitHealthy(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await apiUp()) return true;
    if (child && child.exitCode !== null) return false;
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

export async function startRuntime({ modelId } = {}) {
  if (starting) return starting;
  starting = (async () => {
    try {
      if (await apiUp()) {
        return { ok: true, alreadyRunning: true, baseUrl: RUNTIME_BASE_URL };
      }
      const bin = serverBinary();
      if (!bin) return { ok: false, error: "Talia's built-in engine isn't installed yet." };
      const cfg = await config();
      let id = modelId || cfg.selectedModel || "qwen2.5-1.5b";
      let mp = modelPath(id);
      if (!mp || !existsSync(mp)) {
        // Selected brain isn't on disk — fall back to any downloaded one so a
        // stale selection never blocks starting the engine.
        const downloaded = GGUF_MODELS.find((m) => {
          const p = modelPath(m.id);
          return p && existsSync(p);
        });
        if (!downloaded) return { ok: false, error: "No model downloaded yet — grab one in Settings → Built-in AI." };
        id = downloaded.id;
        mp = modelPath(id);
      }
      stopping = false;
      restarts = 0;
      const spawnOnce = () => {
        const proc = spawn(bin.path, ["-m", mp, "--host", "127.0.0.1", "--port", String(RUNTIME_PORT), "-c", "4096"], {
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
        child = proc;
        proc.stdout?.on("data", (d) => log(d.toString()));
        proc.stderr?.on("data", (d) => log(d.toString()));
        proc.on("exit", (code, signal) => {
          lastExit = { code, signal, at: Date.now() };
          // Only clear the pointer if this exact process is still the live one —
          // a stale exit from a previous spawn (stop→start race) must not
          // orphan the reference to the current engine.
          if (child === proc) child = null;
          // Auto-restart after an unexpected crash (max 3 attempts).
          if (!stopping && child === null && restarts < 3) {
            restarts++;
            log(`[runtime] exited (${code ?? signal}) — restart ${restarts}/3`);
            setTimeout(() => void startRuntime({ modelId: id }), 2000 * restarts);
          }
        });
      };
      spawnOnce();
      const healthy = await waitHealthy();
      if (!healthy) {
        stopRuntime();
        return { ok: false, error: `The engine didn't come up in time.${logs.length ? ` Last log: ${logs.at(-1)}` : ""}` };
      }
      if (id !== cfg.selectedModel) writeCollection("runtime", { ...cfg, selectedModel: id });
      return { ok: true, baseUrl: RUNTIME_BASE_URL, model: id };
    } finally {
      starting = null;
    }
  })();
  return starting;
}

export function stopRuntime() {
  stopping = true;
  if (child) {
    const c = child;
    try {
      c.kill("SIGTERM");
    } catch {
      /* already gone */
    }
    setTimeout(() => {
      try {
        c.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }, 3000).unref?.();
  }
  child = null;
  return { ok: true };
}

export async function runtimeStatus() {
  const target = targetFor(process.platform, process.arch);
  const bin = serverBinary();
  const cfg = await config();
  const running = await apiUp();
  const ramGB = Math.round(os.totalmem() / 1024 ** 3);
  return {
    platform: process.platform,
    arch: process.arch,
    supported: !!target,
    targetLabel: target?.label ?? `${process.platform}/${process.arch}`,
    accelerator: target?.accelerator ?? null,
    device: deviceLabel(process.platform, process.arch, ramGB),
    ramGB,
    recommendedBrain: recommendedBrain(ramGB),
    installed: !!bin,
    version: bin?.version ?? null,
    running,
    baseUrl: RUNTIME_BASE_URL,
    port: RUNTIME_PORT,
    selectedModel: cfg.selectedModel ?? null,
    autoStart: cfg.autoStart !== false,
    models: GGUF_MODELS.map((m) => {
      const p = modelPath(m.id);
      const downloaded = !!p && existsSync(p);
      return { id: m.id, name: m.name, size: m.size, sizeBytes: m.sizeBytes, blurb: m.blurb, recommended: !!m.recommended, downloaded, bytes: downloaded ? statSync(p).size : 0 };
    }),
    lastExit,
    recentLogs: logs.slice(-6),
  };
}

/** Fire-and-forget on server boot: bring the brain up if it's ready. */
export async function ensureAutoStart() {
  try {
    const cfg = await config();
    if (cfg.autoStart === false) return;
    const bin = serverBinary();
    if (!bin) return;
    const mp = modelPath(cfg.selectedModel || "");
    if (!mp || !existsSync(mp)) return;
    if (await apiUp()) return;
    const r = await startRuntime({});
    if (r.ok) console.log(`🧠 Talia's built-in engine is up (${cfg.selectedModel}) — no drivers needed.`);
    else console.log(`🧠 Built-in engine idle: ${r.error}`);
  } catch (err) {
    console.log(`🧠 Built-in engine auto-start skipped: ${err.message}`);
  }
}
