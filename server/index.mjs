import express from "express";
import http from "node:http";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildProviderRequest, validateProviderConfig, classifyUpstreamError } from "./provider.mjs";
import { encodeSSE } from "./sse.mjs";
import { api } from "./routes.mjs";
import { runtimeApi } from "./runtimeRoutes.mjs";
import { dotsApi } from "./dotsRoutes.mjs";
import { startDotsScheduler, stopDotsScheduler } from "./dots.mjs";
import { startLearningScheduler, stopLearningScheduler } from "./learning.mjs";
import { ensureAutoStart, stopRuntime } from "./runtime.mjs";
import { flushNow } from "./store.mjs";
import { isOffline, isLocalUrl, offlineError, safeBaseUrl } from "./settings.mjs";
import { startEngineAutoUpdate, stopEngineAutoUpdate } from "./updates.mjs";
import { harden } from "./asyncSafe.mjs";

const app = express();

// --- CORS: who may call this API from a browser? ---------------------------
// The desktop app and `npm run server` are same-origin (this server serves
// both the UI and the API), so they need nothing. The Android thin client is
// cross-origin and must be allowed. But a blanket `*` would let any website
// the user visits read this API from their own browser — every chat, the
// memory store and any saved provider key — so the allowlist is exact:
// requests with no Origin header (curl, the sidecar itself), the app's own
// origin, Tauri's webview origins and the Vite dev server. Everything else
// gets no Access-Control-Allow-Origin header, so a browser refuses to read
// the response; non-browser clients are unaffected.
const EXTRA_ORIGINS = new Set([
  "tauri://localhost",        // Tauri custom protocol (macOS)
  "http://tauri.localhost",   // Tauri custom protocol (Windows/Linux)
  "https://tauri.localhost",
  "http://localhost:5173",    // Vite dev server
  "http://127.0.0.1:5173",
  "http://localhost:1420",    // Tauri's default dev port
  "http://127.0.0.1:1420",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const host = req.headers.host;
  const sameOrigin =
    !!origin && !!host && (origin === `http://${host}` || origin === `https://${host}`);
  if (!origin || sameOrigin || EXTRA_ORIGINS.has(origin)) {
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Max-Age", "600");
      return res.status(204).end();
    }
  }
  next();
});

app.use(express.json({ limit: "10mb" }));
harden(app); // async handler throws → JSON errors, never a crashed sidecar

// v2 feature API (sessions, memory, research, media, catalog)
app.use("/api", api);

// Built-in local AI engine + update checks (no drivers, zero setup)
app.use("/api/runtime", runtimeApi);

// 🤖 Dots — always-on agents that keep working between conversations.
app.use("/api", dotsApi);

// Standalone mode: serve the built frontend from dist/ when present,
// so `npm run server` alone is the whole app.
// Inside the desktop sidecar (Node SEA), import.meta.url is unavailable,
// so the Tauri launcher sets TALIA_DIST_DIR explicitly.
const here = typeof import.meta.url === "string" ? fileURLToPath(import.meta.url) : ".";
const distDir = process.env.TALIA_DIST_DIR || join(dirname(here), "..", "dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(distDir, "index.html")));
}

const state = {
  stopFlags: new Set(),
  sseClients: new Set(),
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "talia-server", time: new Date().toISOString() });
});

// --- SSE stop-signal channel -------------------------------------------
app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`retry: 2000\n\n`);
  state.sseClients.add(res);
  req.on("close", () => state.sseClients.delete(res));
});

function broadcastStop() {
  for (const res of state.sseClients) {
    res.write(`event: stop\ndata: {}\n\n`);
  }
}

// --- Stop generation ----------------------------------------------------
app.post("/api/stop", (req, res) => {
  const id = String(req.body?.requestId || "");
  if (id) state.stopFlags.add(id);
  broadcastStop();
  res.json({ ok: true });
});

// --- Provider reachability & listing helpers ----------------------------
// Providers differ about which path answers: OpenAI-style bases end in /v1,
// Ollama answers on / and /api/tags, and the built-in engine 404s on /. Probe
// the meaningful endpoints (stem = base with any /v1 suffix removed) and
// treat any 2xx as "reachable".
const providerProbeUrls = (rawBaseUrl) => {
  const root = rawBaseUrl.replace(/\/+$/, "");
  const stem = root.replace(/\/v1$/, "");
  return [...new Set([`${stem}/v1/models`, `${stem}/api/tags`, `${root}/`, `${stem}/`])];
};

// Some engines report models as full file paths (GGUF builds). Show the file
// name without extension — prettier in the picker and stable to match.
function prettyModelId(id) {
  if (!id.includes("/")) return id;
  const base = id.split("/").pop() || id;
  return base.replace(/\.(gguf|safetensors|bin)$/i, "") || id;
}

// --- Health of the local LLM provider ----------------------------------
app.get("/api/provider/health", async (req, res) => {
  const base = safeBaseUrl(req.query.baseUrl) ?? "http://localhost:11434";
  const cfg = {
    baseUrl: base,
    apiKey: req.query.apiKey ? String(req.query.apiKey) : undefined,
  };
  if ((await isOffline()) && !isLocalUrl(cfg.baseUrl)) {
    return res.json({ online: false, status: 0, error: offlineError("Checking this provider") });
  }
  const headers = cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : undefined;
  let lastStatus = 0;
  for (const url of providerProbeUrls(cfg.baseUrl)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const r = await fetch(url, { signal: controller.signal, headers });
      clearTimeout(timer);
      lastStatus = r.status;
      if (r.ok) return res.json({ online: true, status: r.status });
    } catch {
      // try the next candidate
    }
  }
  res.json({ online: false, status: lastStatus });
});

// --- Model discovery ----------------------------------------------------
// Normalizes provider-specific listing endpoints into [{ id }]
app.get("/api/provider/models", async (req, res) => {
  const baseUrl = safeBaseUrl(req.query.baseUrl) ?? "http://localhost:11434";
  const apiKey = req.query.apiKey ? String(req.query.apiKey) : undefined;
  const headers = {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
  if ((await isOffline()) && !isLocalUrl(baseUrl)) {
    return res.status(403).json({ ok: false, error: offlineError("Listing this provider's models") });
  }
  const stem = baseUrl.replace(/\/v1$/, ""); // tolerate OpenAI-style bases: "…/v1" → "…"
  const candidates = [
    `${stem}/v1/models`,
    `${stem}/api/tags`,
  ];
  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const r = await fetch(url, { signal: controller.signal, headers });
      clearTimeout(timer);
      if (!r.ok) continue;
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("json")) continue;
      const body = await r.json();
      const models = [];
      if (Array.isArray(body?.data)) {
        for (const m of body.data) if (m?.id) models.push({ id: prettyModelId(String(m.id)) });
      } else if (Array.isArray(body?.models)) {
        for (const m of body.models) if (m?.name || m?.model) {
          models.push({ id: prettyModelId(String(m.name || m.model)) });
        }
      }
      if (models.length > 0) {
        return res.json({ ok: true, source: url.endsWith("/api/tags") ? "tags" : "v1", models });
      }
      // Empty but valid: keep probing the next candidate
    } catch {
      // try next candidate
    }
  }
  res.status(502).json({
    ok: false,
    error: `Could not list models from ${baseUrl} (tried /v1/models and /api/tags). Is the server running?`,
  });
});

// --- Streaming chat proxy -----------------------------------------------
app.post("/api/chat", async (req, res) => {
  const { provider, messages, model } = req.body ?? {};
  if (!validateProviderConfig(provider)) {
    return res.status(400).json({ error: "Invalid provider configuration." });
  }
  if ((await isOffline()) && !isLocalUrl(provider?.baseUrl ?? "")) {
    return res.status(403).json({ error: offlineError("Chatting with this provider") });
  }
  if (!Array.isArray(messages) || messages.length === 0 || !model) {
    return res.status(400).json({ error: "messages[] and model are required." });
  }

  const id = req.get("x-request-id") || `${Date.now()}-${Math.random()}`;
  let closed = false;
  res.on("close", () => {
    closed = true;
    state.stopFlags.add(id);
  });
  if (state.stopFlags.has(id)) state.stopFlags.delete(id);

  try {
    const upstream = await fetch(buildProviderRequest(provider, messages, model));
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      // A missing local model is a common, recoverable state — classify it so
      // the UI can offer a one-click pull instead of showing a raw 404.
      const info = classifyUpstreamError(upstream.status || 502, text, model);
      return res.status(upstream.status || 502).json({
        error: info.message,
        code: info.code,
        model: info.model,
      });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sent = false;

    while (true) {
      if (closed || state.stopFlags.has(id)) {
        try { reader.cancel(); } catch { /* ignore */ }
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const out = encodeSSE(line, model);
        if (out) {
          res.write(out);
          sent = true;
        }
      }
    }
    if (!sent && !closed) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "No tokens received from provider." })}\n\n`);
    }
    res.end();
  } catch (err) {
    if (!closed) {
      res.status(502).json({ error: `Could not reach provider: ${err.message}` });
    }
  } finally {
    state.stopFlags.delete(id);
  }
});

// Unknown API paths answer JSON, never the SPA fallback. Registered LAST so
// every real /api route above matches first.
app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "Unknown API path" });
});

// Graceful shutdown
const server = http.createServer(app);
server.keepAliveTimeout = 65_000;
server.requestTimeout = 0; // allow long-running SSE streams
async function shutdown(signal) {
  console.log(`\n🌸 ${signal} — saving Talia's memories…`);
  try {
    stopDotsScheduler();
    stopLearningScheduler();
    stopEngineAutoUpdate();
    stopRuntime();
    await flushNow();
  } finally {
    server.close(() => process.exit(0));
  }
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const parsedPort = Number(process.env.PORT);
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 8787;
// Privacy: Talia's API holds your chats, memory and engine controls. Bind to
// loopback by default so only this machine can reach it. Using the Android
// thin client against this machine? Start the server with TALIA_BIND=0.0.0.0
// (or TALIA_LAN=1) to open it to your local network.
const BIND =
  process.env.TALIA_BIND === "0.0.0.0" || process.env.TALIA_LAN === "1"
    ? "0.0.0.0"
    : "127.0.0.1";
server.listen(PORT, BIND, () => {
  console.log(
    BIND === "0.0.0.0"
      ? `🌸 Talia server listening on http://0.0.0.0:${PORT} — open to your network (phone connect). Restrict with TALIA_BIND=127.0.0.1.`
      : `🌸 Talia server listening on http://localhost:${PORT} — local only. Allow phone connections with TALIA_BIND=0.0.0.0.`,
  );
  // Bring Talia's own engine up if it was installed and enabled (best effort).
  if (process.env.TALIA_NO_AUTOSTART !== "1") void ensureAutoStart();
  // Wake any due Dots on their own clock (kill switch: TALIA_DOTS_DISABLED=1).
  startDotsScheduler();
  // 🎓 Let Talia study between visits: distill feedback into lessons (kill
  // switch: TALIA_LEARNING_DISABLED=1).
  startLearningScheduler();
  // 🔄 Keep her built-in engine fresh in the background (opt out:
  // TALIA_ENGINE_AUTOUPDATE=0 or Settings → Auto-update).
  startEngineAutoUpdate();
});

// Built-in self test (used by the sidecar build smoke test and CI):
// boot, hit our own /api/health, print SELFTEST OK, exit 0.
if (process.env.TALIA_SELFTEST === "1") {
  const timer = setTimeout(() => {
    console.error("SELFTEST FAIL: health check timed out");
    process.exit(1);
  }, 15_000);
  fetch(`http://localhost:${PORT}/api/health`)
    .then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (r.ok && body?.ok) {
        console.log("SELFTEST OK");
        clearTimeout(timer);
        shutdown("SELFTEST");
      } else {
        console.error(`SELFTEST FAIL: HTTP ${r.status}`);
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error(`SELFTEST FAIL: ${err.message}`);
      process.exit(1);
    });
}

export { app, server };
