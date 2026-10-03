// Routes for the Dots (always-on agent) subsystem.
import { Router } from "express";
import { harden } from "./asyncSafe.mjs";
import {
  listDots,
  getDot,
  createDot,
  updateDot,
  deleteDot,
  runDotNow,
  recordFeedback,
  onDotEvent,
  armDots,
} from "./dots.mjs";

export const dotsApi = Router();
harden(dotsApi);

// ---------- list & create ---------------------------------------------------
dotsApi.get("/dots", async (_req, res) => {
  res.json({ ok: true, dots: await listDots() });
});

dotsApi.post("/dots", async (req, res) => {
  try {
    const dot = await createDot(req.body || {});
    res.json({ ok: true, dot });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ---------- update / delete -------------------------------------------------
dotsApi.patch("/dots/:id", async (req, res) => {
  try {
    const dot = await updateDot(req.params.id, req.body || {});
    res.json({ ok: true, dot });
  } catch (err) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

dotsApi.delete("/dots/:id", async (req, res) => {
  res.json({ ok: await deleteDot(req.params.id) });
});

// ---------- arm the in-memory provider key ---------------------------------
// The UI calls this on load / when the provider changes so cloud-backed dots
// can run unattended without the key ever touching disk.
dotsApi.post("/dots/arm", async (req, res) => {
  const result = await armDots({ baseUrl: req.body?.baseUrl, apiKey: req.body?.apiKey });
  res.status(result.ok ? 200 : 400).json(result);
});

// ---------- run now ---------------------------------------------------------
dotsApi.post("/dots/:id/run", async (req, res) => {
  const existing = await getDot(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: "dot not found" });
  const result = await runDotNow(req.params.id);
  res.json(result);
});

// ---------- feedback --------------------------------------------------------
dotsApi.post("/dots/:id/feedback", async (req, res) => {
  try {
    const dot = await recordFeedback(req.params.id, {
      rating: req.body?.rating,
      note: req.body?.note,
    });
    res.json({ ok: true, dot });
  } catch (err) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

// ---------- proactive event stream -----------------------------------------
// The UI subscribes once and paints "dot finished" toasts / live rows without
// polling. Same shape as the existing stop-signal channel.
dotsApi.get("/dots/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`retry: 3000\n\n`);
  const unsubscribe = onDotEvent((event) => {
    try {
      res.write(`event: dot\ndata: ${JSON.stringify(event)}\n\n`);
    } catch {
      /* socket already gone */
    }
  });
  // Heartbeat so proxies and idle tabs keep the pipe open.
  const beat = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      /* ignore */
    }
  }, 25_000);
  beat.unref?.();
  req.on("close", () => {
    clearInterval(beat);
    unsubscribe();
  });
});
