// Where the UI finds Talia's server API.
//
// Desktop & standalone: same origin (the sidecar or `npm run server` serves
// both UI and API) → empty string, fetches stay relative (/api/...).
//
// Android (and any remote-client setup): the UI is bundled in the app but the
// API lives on another machine — e.g. http://192.168.1.20:8787 — so every
// fetch is prefixed with the configured base.

const KEY = "talia-ai:api-base";

const isTauriAndroid =
  typeof window !== "undefined" &&
  // Tauri injects __TAURI_INTERNALS__ on all platforms; Android webview origin
  // is tauri://localhost or http://tauri.localhost depending on version.
  typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined" &&
  /android/i.test(navigator.userAgent);

export function getApiBase(): string {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored !== null) return stored.replace(/\/+$/, "");
  } catch {
    /* storage unavailable */
  }
  if (isTauriAndroid) return "http://10.0.2.2:8787"; // Android emulator → host loopback
  return "";
}

export function setApiBase(base: string): void {
  try {
    const cleaned = base.trim().replace(/\/+$/, "");
    if (cleaned) localStorage.setItem(KEY, cleaned);
    else localStorage.removeItem(KEY);
  } catch {
    /* session-only */
  }
}

/** Join a relative API path with the configured base. */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${getApiBase()}${path}`;
}
