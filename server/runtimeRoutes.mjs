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
  quickstart,
  quickstartPlan,
  uninstallRuntime,
  recommendedBrain,
  deviceLabel,
} from "./runtime.mjs";
import {
  sdStatus,
  installSdRuntime,
  downloadSdModel,
  deleteSdModel,
  uninstallSdRuntime,
} from "./sd.mjs";
import os from "node:os";
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

// What would a one-tap setup do right now, and which brain fits this machine?
runtimeApi.get("/quickstart-plan", async (_req, res) => {
  const status = await runtimeStatus();
  const ramGB = Math.round(os.totalmem() / 1024 ** 3);
  res.json({
    ok: true,
    ...quickstartPlan(status),
    recommendedBrain: recommendedBrain(ramGB),
    device: deviceLabel(process.platform, process.arch, ramGB),
  });
});

// One tap: engine + right-sized brain + start + verified. Safe to re-press.
runtimeApi.post("/quickstart", async (req, res) => {
  sseHead(res);
  const result = await quickstart({ onProgress: (p) => send(res, p) });
  send(res, { phase: result.ok ? "complete" : "error", ...result });
  res.end();
});

// Remove the engine and every downloaded brain — one folder was the whole story.
runtimeApi.post("/uninstall", async (_req, res) => {
  res.json(await uninstallRuntime());
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

// ---------- built-in image engine (stable-diffusion.cpp) ---------------------------
runtimeApi.get("/sd/status", async (_req, res) => {
  try {
    res.json({ ok: true, ...(await sdStatus()) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

runtimeApi.post("/sd/install", async (req, res) => {
  sseHead(res);
  const result = await installSdRuntime({ force: !!req.body?.force, onProgress: (p) => send(res, p) });
  send(res, result.ok ? { phase: "complete", ...result } : { phase: "error", error: result.error });
  res.end();
});

runtimeApi.post("/sd/models/download", async (req, res) => {
  sseHead(res);
  const result = await downloadSdModel(String(req.body?.id || ""), (p) => send(res, p));
  send(res, result.ok ? { phase: "complete", ...result } : { phase: "error", error: result.error });
  res.end();
});

runtimeApi.delete("/sd/models/:id", (req, res) => {
  res.json({ ok: deleteSdModel(String(req.params.id || "")) });
});

runtimeApi.post("/sd/uninstall", async (_req, res) => {
  res.json(await uninstallSdRuntime());
});

export { GGUF_MODELS };
