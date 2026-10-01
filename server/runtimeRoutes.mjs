// Routes for Talia's built-in AI engine and the always-up-to-date checks.
import { Router } from "express";
import {
  RUNTIME_BASE_URL,
  GGUF_MODELS,
  runtimeStatus,
  installRuntime,
  downloadModel,
  deleteModel,
  startRuntime,
  stopRuntime,
} from "./runtime.mjs";
import { checkUpdates } from "./updates.mjs";

export const runtimeApi = Router();

function sseHead(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
}

const send = (res, obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

// ---------- status & convenience ---------------------------------------------
runtimeApi.get("/status", async (_req, res) => {
  try {
    res.json({ ok: true, ...(await runtimeStatus()) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

runtimeApi.get("/provider", async (_req, res) => {
  // Convenience for the client: the endpoint Talia's own engine serves.
  const status = await runtimeStatus();
  res.json({ ok: true, baseUrl: RUNTIME_BASE_URL, running: status.running, model: status.selectedModel });
});

// ---------- install / update the engine ---------------------------------------
runtimeApi.post("/install", async (req, res) => {
  sseHead(res);
  const result = await installRuntime({ force: !!req.body?.force, onProgress: (p) => send(res, p) });
  send(res, result.ok ? { phase: "complete", ...result } : { phase: "error", error: result.error });
  res.end();
});

// ---------- models --------------------------------------------------------------
runtimeApi.post("/models/download", async (req, res) => {
  sseHead(res);
  const result = await downloadModel(String(req.body?.id || ""), (p) => send(res, p));
  send(res, result.ok ? { phase: "complete", ...result } : { phase: "error", error: result.error });
  res.end();
});

runtimeApi.delete("/models/:id", (req, res) => {
  res.json({ ok: deleteModel(String(req.params.id || "")) });
});

// ---------- start / stop ----------------------------------------------------------
runtimeApi.post("/start", async (req, res) => {
  const r = await startRuntime({ modelId: req.body?.modelId ? String(req.body.modelId) : undefined });
  res.status(r.ok ? 200 : 400).json({ ok: r.ok, ...(r.ok ? r : { error: r.error }) });
});

runtimeApi.post("/stop", (_req, res) => {
  res.json(stopRuntime());
});

// ---------- always up to date ------------------------------------------------------
runtimeApi.get("/updates", async (req, res) => {
  try {
    res.json({ ok: true, ...(await checkUpdates({ force: req.query.force === "1" })) });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

export { GGUF_MODELS };
