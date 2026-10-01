// 🔄 Always up to date — checks for newer Talia releases and a newer engine.
//
// The app version lives in server/version.mjs so it is embedded into the SEA
// sidecar at build time (the sidecar can't read package.json). Bump it in the
// same commit as package.json.
import { APP_VERSION } from "./version.mjs";
import { isNewer, latestRuntimeRelease, targetFor, RUNTIME_BASE_URL } from "./runtime.mjs";
import { isOffline, offlineError } from "./settings.mjs";

const APP_REPO = "edgemad/talia-ai";

let cache = null;
let cacheAt = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1h — keeps GitHub API calls rare

async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "talia-ai", Accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error(`GitHub responded ${r.status}`);
  return r.json();
}

/** Choose the most relevant download asset for this machine. */
export function pickAppAsset(assets, platform = process.platform, arch = process.arch) {
  const list = (assets ?? []).filter((a) => typeof a?.name === "string");
  const find = (needle) => list.find((a) => a.name.includes(needle)) ?? null;
  if (platform === "darwin") {
    if (arch === "arm64") return find("aarch64.dmg") ?? find(".dmg");
    return find("x64.dmg") ?? find(".dmg");
  }
  if (platform === "win32") return find(".exe") ?? find(".msi");
  if (platform === "linux") return find(".AppImage") ?? find(".deb") ?? find(".rpm");
  if (platform === "android") return find(".apk");
  return null;
}

export async function checkUpdates({ force = false } = {}) {
  if (!force && cache && Date.now() - cacheAt < CACHE_TTL) return cache;

  const app = {
    current: APP_VERSION,
    latest: null,
    updateAvailable: false,
    url: `https://github.com/${APP_REPO}/releases/latest`,
    asset: null,
    assetUrl: null,
    notes: null,
    error: null,
  };
  const runtime = {
    current: null,
    latest: null,
    updateAvailable: false,
    error: null,
  };

  // Answer without touching the network — and without caching, so turning
  // Offline Mode off re-checks immediately.
  if (await isOffline()) {
    return {
      app: { ...app, error: offlineError("Checking for updates") },
      runtime: { ...runtime, error: offlineError("Checking for engine updates") },
      checkedAt: new Date().toISOString(),
      offline: true,
    };
  }

  try {
    const rel = await fetchJson(`https://api.github.com/repos/${APP_REPO}/releases/latest`);
    const tag = String(rel.tag_name ?? "").replace(/^v/, "");
    app.latest = tag || null;
    app.url = rel.html_url ?? app.url;
    app.notes = String(rel.body ?? "").slice(0, 600) || null;
    app.updateAvailable = !!tag && isNewer(tag, APP_VERSION);
    app.asset = pickAppAsset(rel.assets ?? []);
    if (app.asset?.browser_download_url) app.assetUrl = app.asset.browser_download_url;
  } catch (err) {
    app.error = err.message;
  }

  try {
    // Runtime comparison needs the locally installed engine version; import
    // lazily to avoid a cycle with runtimeStatus (runtime.mjs doesn't import us).
    const { runtimeStatus } = await import("./runtime.mjs");
    const status = await runtimeStatus();
    runtime.current = status.version;
    if (status.supported) {
      const rel = await latestRuntimeRelease();
      runtime.latest = rel.tag;
      runtime.updateAvailable = !!rel.tag && !!status.version && isNewer(rel.tag, status.version);
    }
  } catch (err) {
    runtime.error = err.message;
  }

  cache = { app, runtime, checkedAt: new Date().toISOString() };
  cacheAt = Date.now();
  return cache;
}

export { RUNTIME_BASE_URL };
