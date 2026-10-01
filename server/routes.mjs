// v2 feature routes: sessions, memory, research, media, model catalog, bots & skills.
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
import { getSettings, setOffline, isOffline, isLocalUrl, offlineError } from "./settings.mjs";
import { readCollection, writeCollection } from "./store.mjs";
import {
  BUILTIN_BOTS,
  BUILTIN_SKILLS,
  getSkill,
  listUserBots,
  saveBot,
  deleteBot,
} from "./bots.mjs";
import { buildProviderRequest, validateProviderConfig } from "./provider.mjs";
import {
  listGames,
  getPlayableGame,
  installPack,
  uninstallPack,
  listInstalledPacks,
  startGameSession,
  getGameSession,
  endGameSession,
  sanitizeGameState,
} from "./games.mjs";
import { CATALOGUE } from "./gamePacks.mjs";

export const api = Router();

// ---------- Bots ----------------------------------------------------------
api.get("/bots", async (_req, res) => {
  const userBots = await listUserBots();
  res.json({ ok: true, bots: [...BUILTIN_BOTS, ...userBots] });
});

api.post("/bots", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "name required" });
  if (!String(req.body?.systemPrompt || "").trim()) {
    return res.status(400).json({ ok: false, error: "systemPrompt required" });
  }
  const bot = await saveBot(req.body);
  res.json({ ok: true, bot });
});

api.delete("/bots/:id", async (req, res) => {
  if (String(req.params.id).startsWith("builtin-")) {
    return res.status(400).json({ ok: false, error: "built-in bots can't be deleted" });
  }
  res.json({ ok: await deleteBot(req.params.id) });
});

// ---------- Skills ----------------------------------------------------------
// Public metadata only (build functions stay server-side).
api.get("/skills", (_req, res) => {
  res.json({
    ok: true,
    skills: BUILTIN_SKILLS.map(({ build, ...meta }) => meta),
  });
});

// Run a skill: streams the model's answer as normalized SSE (same token
// events as /api/chat, so the client can reuse one parser).
api.post("/skills/:id/run", async (req, res) => {
  const skill = getSkill(String(req.params.id || ""));
  if (!skill) return res.status(404).json({ ok: false, error: "unknown skill" });
  const { provider, model, text, context } = req.body || {};
  if (!validateProviderConfig(provider)) {
    return res.status(400).json({ ok: false, error: "Invalid provider configuration." });
  }
  if (!model) return res.status(400).json({ ok: false, error: "model required" });
  if ((await isOffline()) && !isLocalUrl(provider?.baseUrl ?? "")) {
    return res.status(403).json({ ok: false, error: offlineError("Running skills with this provider") });
  }

  const prompt = skill.build({ text: String(text || ""), context: String(context || "") });
  const messages = [
    ...(prompt.system ? [{ role: "system", content: prompt.system }] : []),
    { role: "user", content: prompt.user || "(empty)" },
  ];

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  try {
    const upstream = await fetch(buildProviderRequest(provider, messages, model));
    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text().catch(() => "");
      res.write(`event: error\ndata: ${JSON.stringify({ error: `Provider responded ${upstream.status}: ${t.slice(0, 300)}` })}\n\n`);
      return res.end();
    }
    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let closed = false;
    res.on("close", () => {
      closed = true;
      try { reader.cancel(); } catch { /* ignore */ }
    });
    while (!closed) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          res.write("data: [DONE]\n\n");
          return res.end();
        }
        try {
          const evt = JSON.parse(payload);
          const token = evt?.choices?.[0]?.delta?.content ?? "";
          if (token) res.write(`data: ${JSON.stringify({ type: "token", token })}\n\n`);
        } catch { /* skip malformed */ }
      }
    }
    res.end();
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: `Could not reach provider: ${err.message}` })}\n\n`);
    res.end();
  }
});

// ---------- Provider presets (free/local first, then cloud APIs) ------------
const PROVIDER_PRESETS = [
  { id: "ollama", name: "Ollama (local & free)", baseUrl: "http://localhost:11434", needsKey: false, hint: "100% free & offline. Start Ollama, then pull a model from the catalog." },
  { id: "lmstudio", name: "LM Studio (local & free)", baseUrl: "http://localhost:1234/v1", needsKey: false, hint: "Free local models with a GUI. Start the LM Studio server." },
  { id: "jan", name: "Jan (local & free)", baseUrl: "http://localhost:1337/v1", needsKey: false, hint: "Free, open-source ChatGPT alternative that runs locally." },
  { id: "llamacpp", name: "llama.cpp server (free)", baseUrl: "http://localhost:8080/v1", needsKey: false, hint: "The reference llama.cpp HTTP server." },
  { id: "groq", name: "Groq (free tier, very fast)", baseUrl: "https://api.groq.com/openai/v1", needsKey: true, hint: "Generous free tier, blazing speed. Key: console.groq.com" },
  { id: "openrouter-free", name: "OpenRouter (free models)", baseUrl: "https://openrouter.ai/api/v1", needsKey: true, hint: "Free models available (:free). Key: openrouter.ai/keys" },
  { id: "gemini", name: "Google Gemini (free tier)", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", needsKey: true, hint: "Free tier via AI Studio. Key: aistudio.google.com" },
  { id: "mistral", name: "Mistral (free tier)", baseUrl: "https://api.mistral.ai/v1", needsKey: true, hint: "Free experiment tier. Key: console.mistral.ai" },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", needsKey: true, hint: "Pay-as-you-go. Key: platform.openai.com" },
  { id: "anthropic", name: "Anthropic Claude", baseUrl: "https://api.anthropic.com/v1", needsKey: true, hint: "Set ANTHROPIC_BASE_URL-compatible proxies here if needed." },
  { id: "custom", name: "Custom / other", baseUrl: "", needsKey: false, hint: "Any OpenAI-compatible endpoint." },
];

api.get("/providers", (_req, res) => {
  res.json({ ok: true, providers: PROVIDER_PRESETS });
});

// ---------- Games Arcade ----------------------------------------------------
api.get("/games", async (_req, res) => {
  res.json({ ok: true, games: await listGames() });
});

api.get("/games/catalogue", async (_req, res) => {
  const installed = new Set((await listInstalledPacks()).map((p) => p.id));
  const catalogue = CATALOGUE.map(({ data, ...meta }) => ({
    ...meta,
    installed: installed.has(meta.id),
    items: data?.questions?.length ?? data?.words?.length ?? data?.maxRounds ?? 0,
  }));
  res.json({ ok: true, catalogue });
});

api.post("/games/install", async (req, res) => {
  const id = String(req.body?.id || "");
  const r = await installPack(id);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });
  res.json({ ok: true, game: { ...r.pack, engineImpl: undefined, data: undefined } });
});

api.post("/games/uninstall", async (req, res) => {
  const ok = await uninstallPack(String(req.body?.id || ""));
  res.json({ ok });
});

api.post("/games/start", async (req, res) => {
  const gameId = String(req.body?.gameId || "");
  const chatId = String(req.body?.chatId || "");
  const game = await getPlayableGame(gameId);
  if (!game?.engineImpl) {
    return res.status(404).json({ ok: false, error: "Unknown game — install it from the catalogue first." });
  }
  const state = game.engineImpl.seed({
    difficulty: req.body?.difficulty,
    level: req.body?.level,
    theme: req.body?.theme,
  });
  const session = startGameSession({ gameId, chatId, game, state });
  const intro = game.engineImpl.intro?.(state) ?? "Let's play!";
  session.history.push({ role: "assistant", content: intro });
  res.json({
    ok: true,
    sessionId: session.id,
    game: { id: game.id, name: game.name, emoji: game.emoji, howTo: game.howTo, needsLlm: !!game.needsLlm },
    state: sanitizeGameState(state),
    intro,
  });
});

// Submit a move. Always SSE: first a `state` event with the fresh sanitized
// game state, then either streamed model tokens or a deterministic engine
// reply, then a `done` event. One response shape, one client parser.
api.post("/games/:sid/move", async (req, res) => {
  const session = getGameSession(String(req.params.sid || ""));
  if (!session) {
    return res.status(404).json({ ok: false, error: "game-session-gone" });
  }
  const text = String(req.body?.text ?? "").slice(0, 2000);
  const provider = req.body?.provider;
  const model = req.body?.model;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  let result;
  try {
    result = session.engine.step(session.state, text);
  } catch (err) {
    send({ type: "error", error: `Game engine hiccup: ${err.message}` });
    return res.end();
  }
  session.state = result.state;
  session.touch();
  send({ type: "state", state: sanitizeGameState(session.state) });

  const finishWith = (fullText) => {
    session.history.push({ role: "user", content: text });
    session.history.push({ role: "assistant", content: fullText });
    if (session.history.length > 24) session.history.splice(0, session.history.length - 24);
    const over = session.state.status && session.state.status !== "playing";
    send({ type: "done", status: session.state.status, summary: over ? finalSummary(session) : null });
    if (over) endGameSession(session.id);
    res.end();
  };

  const needsLlm = result.needsLlm && session.game.needsLlm !== false;
  if (!needsLlm) {
    const reply = result.reply ?? result.fallback ?? "";
    send({ type: "engine", text: reply });
    return finishWith(reply);
  }

  // LLM-voiced move (twenty questions, story chain, prompt packs).
  const providerOffline = (await isOffline()) && !!provider?.baseUrl && !isLocalUrl(provider.baseUrl);
  if (!validateProviderConfig(provider) || !model || providerOffline) {
    const reply = result.reply ?? result.fallback ?? session.engine.fallback?.(session.state, session.game) ?? "Your turn!";
    send({ type: "engine", text: reply });
    return finishWith(reply);
  }
  try {
    const system =
      (result.wrap ? "This is the FINAL turn — wrap things up now.\n" : "") +
      (session.engine.systemPrompt?.(session.state, session.game) ?? "You are a playful game host. Keep replies short, kind and fun.");
    const messages = [
      { role: "system", content: system },
      ...session.history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: String(result.prompt ?? text) },
    ];
    const upstream = await fetch(buildProviderRequest(provider, messages, model));
    if (!upstream.ok || !upstream.body) throw new Error(`provider ${upstream.status}`);
    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let acc = "";
    let closed = false;
    res.on("close", () => {
      closed = true;
      try { reader.cancel(); } catch { /* ignore */ }
    });
    let doneReceived = false;
    while (!closed && !doneReceived) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") { doneReceived = true; break; }
        try {
          const evt = JSON.parse(payload);
          const token = evt?.choices?.[0]?.delta?.content ?? evt?.choices?.[0]?.text ?? "";
          if (token) {
            acc += token;
            send({ type: "token", token });
          }
        } catch { /* skip malformed */ }
      }
    }
    const full = acc.trim();
    if (!full) throw new Error("empty reply");
    // Engines may resolve the move from the model's own words (e.g. the
    // twenty-questions oracle prefixes "WIN:" on a correct guess).
    const parsed = session.engine.parseLlmReply?.(session.state, full);
    if (parsed) {
      session.state = parsed;
      send({ type: "state", state: sanitizeGameState(session.state) });
    }
    return finishWith(full);
  } catch {
    // Reliability guarantee: a game move NEVER dead-ends — fall back to the
    // engine's deterministic reply so play always continues.
    const reply = result.reply ?? result.fallback ?? session.engine.fallback?.(session.state, session.game) ?? "Your turn!";
    send({ type: "engine", text: reply });
    return finishWith(reply);
  }
});

api.post("/games/:sid/end", (req, res) => {
  endGameSession(String(req.params.sid || ""));
  res.json({ ok: true });
});

function finalSummary(session) {
  const s = session.state;
  const name = session.game?.name ?? "Game";
  if (s.status === "won") {
    const score = typeof s.score === "number" ? ` Score: ${s.score}.` : "";
    return `You won ${name}!${score} 🏆`;
  }
  if (s.status === "draw") return `${name} ended in a draw 🤝`;
  return `Good game! ${name} ended — play again anytime.`;
}

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
  if (await isOffline()) return res.status(403).json({ ok: false, error: offlineError("Web research") });
  try {
    const out = await research(query, { maxSources: Number(req.body?.maxSources) || 5 });
    res.json({ ok: true, ...out, quickAnswer: extractiveAnswer(query, out.sources) });
  } catch (err) {
    res.status(502).json({ ok: false, error: `Research failed: ${err.message}` });
  }
});

// ---------- Media -----------------------------------------------------------
api.get("/media/health", async (req, res) => {
  res.json({ ok: true, ...(await mediaHealth({ baseUrl: req.query.baseUrl })) });
});

// ---------- App-wide settings (Offline Mode) ---------------------------------
api.get("/settings", async (_req, res) => {
  res.json({ ok: true, ...(await getSettings()) });
});

api.post("/settings", async (req, res) => {
  const before = await getSettings();
  if (before.offlineLocked) {
    return res.status(403).json({ ok: false, error: "TALIA_OFFLINE=1 forces Offline Mode; it can only be changed in the environment.", ...before });
  }
  const s = await setOffline(!!req.body?.offline);
  res.json({ ok: true, ...s });
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

// ---------- Model catalog (ready to download, starters first) -------------
const CATALOG = [
  {
    id: "llama3.2:3b",
    name: "Llama 3.2 3B",
    family: "meta/llama3.2",
    size: "2 GB",
    tags: ["starter", "fast", "tiny"],
    blurb: "Tiny everyday model — start here if you're new or on modest hardware.",
    pulls: 1,
  },
  {
    id: "gemma3:4b",
    name: "Gemma 3 4B",
    family: "google/gemma3",
    size: "3.3 GB",
    tags: ["starter", "vision", "fast"],
    blurb: "Google's newest small model — punchy for its size and reads images too.",
    pulls: 1,
  },
  {
    id: "qwen3:4b",
    name: "Qwen 3 4B",
    family: "qwen/qwen3",
    size: "3.6 GB",
    tags: ["starter", "reasoning"],
    blurb: "Thinks step-by-step on hard problems, still light enough for laptops.",
    pulls: 1,
  },
  {
    id: "llama3.1:8b",
    name: "Llama 3.1 8B",
    family: "meta/llama3.1",
    size: "4.9 GB",
    tags: ["general", "balanced"],
    blurb: "The reliable all-rounder — great default if you have 8 GB+ free.",
    pulls: 1,
  },
  {
    id: "qwen2.5:7b",
    name: "Qwen 2.5 7B",
    family: "qwen/qwen2.5",
    size: "4.7 GB",
    tags: ["general", "multilingual"],
    blurb: "Strong general knowledge and 29+ languages.",
    pulls: 1,
  },
  {
    id: "mistral-nemo:7b",
    name: "Mistral Nemo 7B",
    family: "mistralai/mistral-nemo",
    size: "4.8 GB",
    tags: ["general", "fast", "apache"],
    blurb: "Quick, chatty, Apache-licensed. A friendly daily driver.",
    pulls: 1,
  },
  {
    id: "qwen2.5-coder:7b",
    name: "Qwen 2.5 Coder 7B",
    family: "qwen/qwen2.5-coder",
    size: "4.7 GB",
    tags: ["code", "apache"],
    blurb: "Best-in-class small coding model. Pairs well with Dolphin for general chat.",
    pulls: 1,
  },
  {
    id: "deepseek-r1:7b",
    name: "DeepSeek R1 7B (distilled)",
    family: "deepseek/deepseek-r1",
    size: "4.7 GB",
    tags: ["reasoning", "math"],
    blurb: "Chain-of-thought reasoner — math, logic and step-by-step problems.",
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
    id: "dolphin-mixtral:8x7b",
    name: "Dolphin Mixtral 8x7B",
    family: "cognitivecomputations/dolphin-mixtral",
    size: "26 GB",
    tags: ["uncensored", "general", "powerful"],
    blurb: "The classic uncensored workhorse. Excellent instruction following, zero moralizing.",
    pulls: 2,
  },
  {
    id: "qwen2.5-coder:32b",
    name: "Qwen 2.5 Coder 32B",
    family: "qwen/qwen2.5-coder",
    size: "20 GB",
    tags: ["code", "powerful"],
    blurb: "Near-GPT-4-class coding on your own machine, if you have the VRAM.",
    pulls: 1,
  },
  {
    id: "phi3:mini",
    name: "Phi-3 Mini",
    family: "microsoft/phi3",
    size: "2.3 GB",
    tags: ["tiny", "fast"],
    blurb: "Microsoft's tiny-but-clever model — runs on almost anything.",
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
  if ((await isOffline()) && !isLocalUrl(baseUrl)) {
    return res.status(403).json({ ok: false, error: offlineError("Model pulls") });
  }

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
    res.write(
      `event: error\ndata: ${JSON.stringify({
        error: `Can't reach ${baseUrl} — start Ollama (or your local server), then pull again. (${err.message})`,
      })}\n\n`,
    );
    res.end();
  }
});
