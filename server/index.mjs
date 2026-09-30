import express from "express";
import cors from "cors";
import http from "node:http";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildProviderRequest, validateProviderConfig } from "./provider.mjs";
import { encodeSSE } from "./sse.mjs";
import { api } from "./routes.mjs";
import { flushNow } from "./store.mjs";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// v2 feature API (sessions, memory, research, media, catalog)
app.use("/api", api);

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

// --- Health of the local LLM provider ----------------------------------
app.get("/api/provider/health", async (req, res) => {
  const cfg = {
    baseUrl: String(req.query.baseUrl || "http://localhost:11434"),
    apiKey: req.query.apiKey ? String(req.query.apiKey) : undefined,
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(cfg.baseUrl.replace(/\/+$/, "") + "/", {
      signal: controller.signal,
      headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : undefined,
    });
    clearTimeout(timer);
    res.json({ online: r.ok, status: r.status });
  } catch {
    res.json({ online: false, status: 0 });
  }
});

// --- Model discovery ----------------------------------------------------
// Normalizes provider-specific listing endpoints into [{ id }]
app.get("/api/provider/models", async (req, res) => {
  const baseUrl = String(req.query.baseUrl || "http://localhost:11434").replace(/\/+$/, "");
  const apiKey = req.query.apiKey ? String(req.query.apiKey) : undefined;
  const headers = {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
  const candidates = [
    `${baseUrl}/v1/models`,
    `${baseUrl}/api/tags`,
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
        for (const m of body.data) if (m?.id) models.push({ id: String(m.id) });
      } else if (Array.isArray(body?.models)) {
        for (const m of body.models) if (m?.name || m?.model) {
          models.push({ id: String(m.name || m.model) });
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
      return res.status(upstream.status || 502).json({
        error: `Provider responded ${upstream.status}: ${text.slice(0, 500)}`,
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

// Graceful shutdown
const server = http.createServer(app);
server.keepAliveTimeout = 65_000;
server.requestTimeout = 0; // allow long-running SSE streams
async function shutdown(signal) {
  console.log(`\n🌸 ${signal} — saving Talia's memories…`);
  try {
    await flushNow();
  } finally {
    server.close(() => process.exit(0));
  }
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const parsedPort = Number(process.env.PORT);
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 8787;
server.listen(PORT, () => {
  console.log(`🌸 Talia server listening on http://localhost:${PORT}`);
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
