// v2 feature routes: sessions, memory, research, media, model catalog.
import { Router } from "express";
import {
  rememberFact,
  recall,
  listMemory,
  forgetFact,
  forgetAll,
  snippetCandidates,
} from "./memory.mjs";
import { research, extractiveAnswer } from "./research.mjs";
import { generateImage, generateVideo, synthesizeSpeech, mediaHealth } from "./media.mjs";
import { readCollection, writeCollection } from "./store.mjs";

export const api = Router();

// ---------- Sessions (server-side, cross-chat persistence) ---------------
api.get("/sessions", async (_req, res) => {
  const sessions = await readCollection("sessions", []);
  res.json({ ok: true, sessions });
});

api.put("/sessions", async (req, res) => {
  const sessions = req.body?.sessions;
  if (!Array.isArray(sessions)) return res.status(400).json({ ok: false, error: "sessions[] required" });
  writeCollection("sessions", sessions.slice(0, 200));
  res.json({ ok: true, count: sessions.length });
});

// ---------- Memory --------------------------------------------------------
api.get("/memory", async (_req, res) => {
  res.json({ ok: true, items: await listMemory() });
});

api.post("/memory", async (req, res) => {
  const item = await rememberFact({
    text: req.body?.text,
    source: req.body?.source || "manual",
    sessionId: req.body?.sessionId || null,
  });
  const { vec, ...clean } = item ?? {};
  res.json({ ok: !!item, item: clean });
});

api.post("/memory/remember-exchange", async (req, res) => {
  const { userText, assistantText, sessionId } = req.body || {};
  const saved = [];
  for (const c of snippetCandidates(userText || "")) {
    const it = await rememberFact({ text: c, source: "chat-you", sessionId });
    if (it) saved.push(it);
  }
  for (const c of snippetCandidates(assistantText || "")) {
    const it = await rememberFact({ text: c, source: "chat-talia", sessionId });
    if (it) saved.push(it);
  }
  res.json({ ok: true, saved: saved.length });
});

api.post("/memory/recall", async (req, res) => {
  const { query, limit } = req.body || {};
  const hits = await recall(String(query || ""), { limit: Number(limit) || 6 });
  res.json({ ok: true, hits: hits.map(({ score, ...h }) => ({ ...h, score: Number(score.toFixed(3)) })) });
});

api.delete("/memory/:id", async (req, res) => {
  res.json({ ok: await forgetFact(req.params.id) });
});

api.delete("/memory", async (_req, res) => {
  await forgetAll();
  res.json({ ok: true });
});

// ---------- Research -------------------------------------------------------
api.post("/research", async (req, res) => {
  const query = String(req.body?.query || "").trim();
  if (!query) return res.status(400).json({ ok: false, error: "query required" });
  try {
    const out = await research(query, { maxSources: Number(req.body?.maxSources) || 5 });
    res.json({ ok: true, ...out, quickAnswer: extractiveAnswer(query, out.sources) });
  } catch (err) {
    res.status(502).json({ ok: false, error: `Research failed: ${err.message}` });
  }
});

// ---------- Media -----------------------------------------------------------
api.get("/media/health", async (_req, res) => {
  res.json({ ok: true, ...(await mediaHealth()) });
});

api.post("/media/image", async (req, res) => {
  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ ok: false, error: "prompt required" });
  res.json(await generateImage(req.body, req.body?.baseUrl));
});

api.post("/media/tts", async (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ ok: false, error: "text required" });
  res.json(await synthesizeSpeech(req.body));
});

api.post("/media/video", async (req, res) => {
  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ ok: false, error: "prompt required" });
  res.json(await generateVideo(req.body, req.body?.baseUrl));
});

// ---------- Model catalog (uncensored / capable local models) ---------------
const CATALOG = [
  {
    id: "dolphin-mixtral:8x7b",
    name: "Dolphin Mixtral 8x7B",
    family: "cognitivecomputations/dolphin-mixtral",
    size: "26 GB",
    tags: ["uncensored", "general", "powerful"],
    blurb: "The classic uncensored workhorse. Excellent instruction following, zero moralizing.",
    pulls: 2,
  },
  {
    id: "dolphin-mistral:7b",
    name: "Dolphin Mistral 7B",
    family: "cognitivecomputations/dolphin-mistral",
    size: "4.1 GB",
    tags: ["uncensored", "fast"],
    blurb: "Lightweight uncensored daily driver. Great on 8 GB machines.",
    pulls: 1,
  },
  {
    id: "dolphin3:8b",
    name: "Dolphin 3 (Llama 3.1 8B)",
    family: "cognitivecomputations/dolphin3",
    size: "4.9 GB",
    tags: ["uncensored", "general"],
    blurb: "Newer Dolphin tuned on Llama 3.1 — strong general assistant.",
    pulls: 1,
  },
  {
    id: "qwen2.5-coder:7b",
    name: "Qwen 2.5 Coder 7B",
    family: "qwen/qwen2.5-coder",
    size: "4.7 GB",
    tags: ["code", "apache"],
    blurb: "Best-in-class small coding model, Apache-2.0. Pairs well with Dolphin for general chat.",
    pulls: 1,
  },
  {
    id: "llama3.2-vision:11b",
    name: "Llama 3.2 Vision 11B",
    family: "meta/llama3.2-vision",
    size: "7.9 GB",
    tags: ["vision", "images-in"],
    blurb: "Understands images you paste into chat (llava-style). Input multimodality.",
    pulls: 1,
  },
  {
    id: "llava:7b",
    name: "LLaVA 7B",
    family: "liuhaotian/llava",
    size: "4.7 GB",
    tags: ["vision", "images-in"],
    blurb: "Classic image-understanding model; light enough for most GPUs.",
    pulls: 1,
  },
  {
    id: "llama3.2:3b",
    name: "Llama 3.2 3B",
    family: "meta/llama3.2",
    size: "2 GB",
    tags: ["fast", "tiny"],
    blurb: "Tiny everyday model for modest hardware.",
    pulls: 1,
  },
];

api.get("/models/catalog", (_req, res) => {
  res.json({ ok: true, catalog: CATALOG });
});

// One-click pull via the provider (Ollama-style). Streams progress lines as SSE.
api.post("/models/pull", async (req, res) => {
  const { baseUrl, model } = req.body || {};
  if (!baseUrl || !model) return res.status(400).json({ ok: false, error: "baseUrl and model required" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  try {
    const upstream = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
    });
    if (!upstream.ok || !upstream.body) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: `pull failed (${upstream.status})` })}\n\n`);
      return res.end();
    }
    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        res.write(`data: ${line}\n\n`);
      }
    }
    res.write("data: {\"status\":\"done\"}\n\n");
    res.end();
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});
