// 🤖 Dots — always-on agents, in the spirit of OpenAI's Dots.
//
// A "dot" is a persistent, goal-holding agent that keeps working *between*
// conversations: the scheduler wakes it on its cadence, it thinks with your
// local model, pulls in live web research when it's allowed to act, writes a
// progress report you can read later, and learns from your feedback over time.
//
// Everything is local, JSON-backed, and honesty-first:
//   • a dot only touches the network when Offline Mode is off AND the dot is
//     set to "act" — otherwise it works purely from the model's own knowledge;
//   • the whole subsystem can be disabled with TALIA_DOTS_DISABLED=1;
//   • no shell, no filesystem, no "computer" — a dot's tools are the model,
//     memory and (optionally) web research. That keeps an always-on loop from
//     ever running away with your machine.

import { readCollection, writeCollection } from "./store.mjs";
import { rememberFact, recall } from "./memory.mjs";
import { research } from "./research.mjs";
import { isOffline, isLocalUrl, offlineError } from "./settings.mjs";

const COLLECTION = "dots";

export const DEFAULT_CADENCE_MINUTES = 60;
export const MIN_CADENCE_MINUTES = 5;
export const MAX_CADENCE_MINUTES = 24 * 60;
export const MAX_ACTIVITY = 60;
export const MAX_ARTIFACTS = 12;
export const MAX_LEARNINGS = 12;
export const MAX_DOTS = 24;

// ---------- ids & small helpers ------------------------------------------
export function dotId() {
  return `dot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function entryId() {
  return `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clampInt(n, lo, hi, fallback) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
}

function nowMs() {
  return Date.now();
}

// ---------- pure model helpers -------------------------------------------

/** Normalize arbitrary input into a well-formed dot (no persistence). */
export function createDotShape(input = {}, now = nowMs()) {
  const cadence = clampInt(
    input.cadenceMinutes,
    MIN_CADENCE_MINUTES,
    MAX_CADENCE_MINUTES,
    DEFAULT_CADENCE_MINUTES,
  );
  const enabled = input.enabled !== false;
  return {
    id: input.id || dotId(),
    name: String(input.name || "New dot").trim().slice(0, 60) || "New dot",
    emoji: String(input.emoji || "🔵").trim().slice(0, 4) || "🔵",
    goal: String(input.goal || "").trim().slice(0, 2000),
    instructions: String(input.instructions || "").trim().slice(0, 4000),
    autonomy: input.autonomy === "suggest" ? "suggest" : "act",
    cadenceMinutes: cadence,
    enabled,
    status: "idle",
    createdAt: now,
    updatedAt: now,
    lastRunAt: null,
    // First session starts a minute out, not mid-creation — gives the user a
    // beat to finish setting up (and the scheduler a clean wake-up to find).
    nextRunAt: enabled ? now + 60_000 : null,
    runCount: 0,
    provider: input.provider ?? null,
    model: String(input.model || ""),
    activity: [],
    artifacts: [],
    feedback: [],
    learnings: Array.isArray(input.learnings)
      ? input.learnings.map((s) => String(s)).slice(-MAX_LEARNINGS)
      : [],
  };
}

/** The standing brief a dot wakes up with every session. */
export function buildDotSystemPrompt(dot, { memories = [], today = new Date() } = {}) {
  const lines = [
    `You are ${dot.emoji || "🔵"} ${dot.name}, an always-on agent (a "dot") created by the user to make progress on a standing goal.`,
    ``,
    `Your standing goal: ${dot.goal || "(not set — ask the user when they're next around)"}`,
  ];
  if (dot.instructions) lines.push(``, `Standing instructions:`, dot.instructions);
  if (dot.learnings?.length) {
    lines.push(``, `What you've learned from the user's feedback (respect this):`);
    for (const l of dot.learnings) lines.push(`- ${l}`);
  }
  if (memories.length) {
    lines.push(``, `Relevant things you remember about the user:`);
    for (const m of memories) lines.push(`- ${m.text}`);
  }
  lines.push(
    ``,
    `How you work:`,
    `- You make progress a little at a time, between the user's visits. Nobody is watching right now.`,
    `- NEVER ask the user a question and never wait for input — make a sensible call and report it.`,
    `- Finish with a concise progress report: what you did, what you found, what's next. Markdown is welcome.`,
    "- If (and only if) you need current facts from the live web, reply with EXACTLY one line and nothing else:",
    `  RESEARCH: <a specific search query>`,
    `- You will then receive the sources and get a chance to write your report. Otherwise just write the report.`,
    ``,
    `Today is ${today.toDateString()}.`,
  );
  return lines.join("\n");
}

/** The per-session kick-off message. */
export function buildDotUserPrompt(dot) {
  const runs = dot.runCount || 0;
  const phase = runs === 0 ? "This is your first work session." : `This is work session #${runs + 1}.`;
  return `${phase} Take one concrete step toward your goal, then write your progress report.`;
}

/**
 * Detect whether a model reply is asking for research or is the final report.
 * Small local models can't reliably do JSON tool-calls, so we use one honest
 * line protocol: the FIRST non-empty line starting with "RESEARCH:".
 */
export function parseDotAction(reply) {
  const text = String(reply || "").trim();
  if (!text) return { kind: "report", text: "" };
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) || "";
  const m = firstLine.match(/^(?:ACTION\s*[:=]\s*)?RESEARCH\s*[:=]\s*(.+)$/i);
  if (m && m[1].trim()) return { kind: "research", query: m[1].trim().slice(0, 300) };
  return { kind: "report", text };
}

/** Which enabled dots are due for a work session right now? */
export function selectDueDots(dots, now = nowMs()) {
  return (dots || []).filter(
    (d) => d && d.enabled && d.status !== "working" && (d.nextRunAt ?? 0) <= now,
  );
}

/** Fold a rating/note into a dot's learnings (pure — returns a new array). */
export function distillLearning(rating, note) {
  const clean = String(note || "").trim().slice(0, 280);
  if (rating === "up") return clean ? `Keep doing: ${clean}` : "The last approach was on the right track — keep going.";
  if (rating === "down") return clean ? `Avoid: ${clean}` : "The last approach missed the mark — try a different angle.";
  return clean ? `Note to self: ${clean}` : "";
}

/** Apply feedback to a dot in place-ish (returns the same object, bounded). */
export function applyFeedback(dot, { rating, note }, now = nowMs()) {
  const feedback = Array.isArray(dot.feedback) ? dot.feedback : [];
  feedback.push({ ts: now, rating: String(rating || "note"), note: String(note || "").slice(0, 500) });
  dot.feedback = feedback.slice(-MAX_LEARNINGS);
  const learning = distillLearning(rating, note);
  if (learning) {
    dot.learnings = [...(dot.learnings || []), learning].slice(-MAX_LEARNINGS);
  }
  dot.updatedAt = now;
  return dot;
}

/** Trim a dot for the wire so responses stay small. */
export function publicDot(dot) {
  if (!dot) return null;
  return {
    id: dot.id,
    name: dot.name,
    emoji: dot.emoji,
    goal: dot.goal,
    instructions: dot.instructions,
    autonomy: dot.autonomy,
    cadenceMinutes: dot.cadenceMinutes,
    enabled: dot.enabled,
    status: dot.status,
    createdAt: dot.createdAt,
    updatedAt: dot.updatedAt,
    lastRunAt: dot.lastRunAt,
    nextRunAt: dot.nextRunAt,
    runCount: dot.runCount,
    model: dot.model,
    provider: dot.provider ? { baseUrl: dot.provider.baseUrl } : null,
    activity: (dot.activity || []).slice(-40),
    artifacts: (dot.artifacts || []).slice(-8),
    learnings: (dot.learnings || []).slice(-MAX_LEARNINGS),
    feedback: (dot.feedback || []).slice(-MAX_LEARNINGS),
  };
}

// ---------- event bus (proactive notifications) ---------------------------

const listeners = new Set();

/** Subscribe to dot lifecycle events. Returns an unsubscribe function. */
export function onDotEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitDotEvent(event) {
  const payload = { ...event, ts: event.ts ?? nowMs() };
  for (const fn of listeners) {
    try {
      fn(payload);
    } catch {
      /* a bad listener must never break the loop */
    }
  }
}

// ---------- provider credentials (never written to disk) -------------------
// A dot needs its provider's apiKey to run while the UI is closed, but a secret
// sitting in plaintext on disk is exactly what this app avoids. So the key lives
// in memory only: it is captured when the client creates, updates or arms a dot,
// used for unattended runs, and dropped on restart — the client re-arms it the
// next time the app loads. Dots backed by a keyless local model (Ollama, LM
// Studio, …) need none of this and keep running headless forever.
const runtimeKeys = new Map();

function sanitizeProvider(provider) {
  if (!provider || typeof provider !== "object") return null;
  const rest = { ...provider };
  delete rest.apiKey;
  return rest;
}

function captureKey(id, provider) {
  if (provider && typeof provider === "object" && provider.apiKey) {
    runtimeKeys.set(id, String(provider.apiKey));
  }
}

/** Give every dot pointed at this provider the in-memory key (called by the UI). */
export async function armDots({ baseUrl, apiKey } = {}) {
  if (!baseUrl || !apiKey) return { ok: false, count: 0, error: "baseUrl and apiKey required" };
  const list = await load();
  let count = 0;
  for (const d of list) {
    if (d.provider && d.provider.baseUrl === baseUrl) {
      runtimeKeys.set(d.id, String(apiKey));
      count += 1;
    }
  }
  return { ok: true, count };
}

// ---------- durable store ---------------------------------------------------

/**
 * A dot can only be "working" inside a live process. If we find one stuck in
 * that state after a restart (killed mid-run), it would be skipped forever —
 * so we reset it to idle on load. Returns true when anything changed.
 */
export function recoverStuckDots(list, now = nowMs()) {
  let changed = false;
  for (const d of list || []) {
    if (d && d.status === "working") {
      d.status = "idle";
      d.updatedAt = now;
      changed = true;
    }
  }
  return changed;
}

let dots = null;
let loading = null;

async function load() {
  if (dots) return dots;
  if (!loading) {
    loading = readCollection(COLLECTION, []).then((raw) => {
      dots = Array.isArray(raw) ? raw : [];
      // Migrate away any key an earlier build may have written to disk.
      let sanitized = false;
      for (const d of dots) {
        if (d?.provider && "apiKey" in d.provider) {
          captureKey(d.id, d.provider);
          d.provider = sanitizeProvider(d.provider);
          sanitized = true;
        }
      }
      if (recoverStuckDots(dots) || sanitized) persist();
      loading = null;
      return dots;
    });
  }
  return loading;
}

function persist() {
  // Store the FULL dot (bounded by the MAX_* caps at push time). Trimming to
  // the wire shape here would silently drop provider.apiKey — which a dot needs
  // to keep working while the UI is closed — and older artifacts.
  writeCollection(COLLECTION, (dots || []).map((d) => ({ ...d })));
}

export async function listDots() {
  const list = await load();
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt).map(publicDot);
}

export async function getDot(id) {
  const list = await load();
  return list.find((d) => d.id === id) || null;
}

export async function createDot(input) {
  const list = await load();
  if (list.length >= MAX_DOTS) {
    throw new Error(`You can have at most ${MAX_DOTS} dots — delete one first.`);
  }
  if (!String(input?.goal || "").trim()) {
    throw new Error("A dot needs a goal.");
  }
  const dot = createDotShape(input);
  captureKey(dot.id, input.provider);
  dot.provider = sanitizeProvider(input.provider);
  dot.activity.push({
    id: entryId(),
    ts: dot.createdAt,
    kind: "note",
    text: `Dot created — goal: ${dot.goal.slice(0, 160)}`,
  });
  list.push(dot);
  persist();
  emitDotEvent({ kind: "created", dotId: dot.id, name: dot.name });
  return publicDot(dot);
}

const PATCHABLE = {
  name: "string",
  emoji: "string",
  goal: "string",
  instructions: "string",
  model: "string",
  autonomy: "string",
  enabled: "boolean",
  cadenceMinutes: "number",
  provider: "object",
};

export async function updateDot(id, patch = {}) {
  const list = await load();
  const dot = list.find((d) => d.id === id);
  if (!dot) throw new Error("dot not found");
  // Validate before mutating so a bad patch can't leave a half-applied dot.
  if ("goal" in patch && !String(patch.goal || "").trim()) {
    throw new Error("A dot needs a goal.");
  }
  const now = nowMs();
  let reschedule = false;
  for (const [key, type] of Object.entries(PATCHABLE)) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (type === "number") {
      dot[key] = clampInt(value, MIN_CADENCE_MINUTES, MAX_CADENCE_MINUTES, dot.cadenceMinutes);
      reschedule = true;
    } else if (type === "boolean") {
      const next = !!value;
      if (next !== dot.enabled) reschedule = true;
      dot.enabled = next;
    } else if (type === "object") {
      if (key === "provider") {
        captureKey(dot.id, value);
        dot.provider = sanitizeProvider(value);
      } else {
        dot[key] = value ?? null;
      }
    } else {
      const str = String(value);
      if (key === "name") dot[key] = str.slice(0, 60) || dot.name;
      else if (key === "emoji") dot[key] = str.slice(0, 4) || dot.emoji;
      else dot[key] = str.slice(0, key === "instructions" ? 4000 : 2000);
    }
  }
  // Enabling (re)computes the next wake-up; disabling clears it.
  if (reschedule) {
    dot.nextRunAt = dot.enabled ? now + Math.min(dot.cadenceMinutes, 5) * 60_000 : null;
  }
  dot.updatedAt = now;
  persist();
  emitDotEvent({ kind: "updated", dotId: dot.id });
  return publicDot(dot);
}

export async function deleteDot(id) {
  const list = await load();
  const before = list.length;
  dots = list.filter((d) => d.id !== id);
  persist();
  if (dots.length < before) emitDotEvent({ kind: "deleted", dotId: id });
  return dots.length < before;
}

// ---------- talking to the model ------------------------------------------

function providerUrl(provider) {
  const raw = String(provider?.baseUrl || "").replace(/\/+$/, "");
  return raw.endsWith("/v1") ? `${raw}/chat/completions` : `${raw}/v1/chat/completions`;
}

/**
 * One non-streaming completion. The interactive chat path streams; a dot
 * works on its own clock and only needs the finished text.
 */
export async function chatOnce(provider, model, messages, { temperature, maxTokens = 900 } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (provider?.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const r = await fetch(providerUrl(provider), {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature:
          typeof temperature === "number"
            ? temperature
            : typeof provider?.temperature === "number"
              ? provider.temperature
              : 0.6,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
      }),
    });
    if (!r.ok) throw new Error(`provider responded ${r.status}`);
    const body = await r.json();
    return String(body?.choices?.[0]?.message?.content ?? "").trim();
  } finally {
    clearTimeout(timer);
  }
}

function validateProvider(provider) {
  try {
    const u = new URL(String(provider?.baseUrl || ""));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Run one work session for a dot: think → (optionally research) → report.
 * Pure-ish: it does not persist; callers decide what to store.
 */
export async function runDot(dot, { maxSources = 4 } = {}) {
  const stored = dot.provider || {};
  const provider = runtimeKeys.has(dot.id)
    ? { ...stored, apiKey: runtimeKeys.get(dot.id) }
    : stored;
  const model = dot.model;
  if (!validateProvider(provider)) {
    throw new Error("This dot has no provider — open it and pick your model/provider first.");
  }
  if (!model) {
    throw new Error("This dot has no model selected — open it and pick a model first.");
  }
  const offline = await isOffline();
  if (offline && !isLocalUrl(provider.baseUrl)) {
    throw new Error(offlineError("Running this dot's provider"));
  }

  const memories = await recall(dot.goal, { limit: 5 });
  const system = buildDotSystemPrompt(dot, { memories });
  let messages = [
    { role: "system", content: system },
    { role: "user", content: buildDotUserPrompt(dot) },
  ];

  let reply = await chatOnce(provider, model, messages);
  let sources = [];
  let researchedQuery = null;

  const action = parseDotAction(reply);
  if (action.kind === "research") {
    const canResearch = dot.autonomy === "act" && !offline;
    if (canResearch) {
      researchedQuery = action.query;
      const r = await research(action.query, { maxSources });
      sources = r.sources || [];
      messages = [
        ...messages,
        { role: "assistant", content: `RESEARCH: ${action.query}` },
        {
          role: "user",
          content: `${r.context}\n\nNow write your progress report. Cite sources inline like [1] where relevant, and say what you'll do next.`,
        },
      ];
      reply = await chatOnce(provider, model, messages);
    } else {
      // Research is unavailable — get a report from what the model already knows.
      messages = [
        ...messages,
        { role: "assistant", content: reply },
        {
          role: "user",
          content:
            "Live web research is unavailable right now. Write your progress report from what you already know, and note that you couldn't check the web this time.",
        },
      ];
      reply = await chatOnce(provider, model, messages);
    }
  }

  const report = String(reply || "").trim() || "(the model returned an empty report)";
  return { report, sources, researchedQuery };
}

// ---------- run + record ---------------------------------------------------

async function markWorking(dot) {
  dot.status = "working";
  dot.updatedAt = nowMs();
  persist();
  emitDotEvent({ kind: "started", dotId: dot.id, name: dot.name });
}

/** Run a dot by id, recording status, artifact, activity and memory. */
export async function runDotNow(id) {
  const list = await load();
  const dot = list.find((d) => d.id === id);
  if (!dot) throw new Error("dot not found");
  if (dot.status === "working") return { ok: false, error: "this dot is already working" };

  await markWorking(dot);
  const startedAt = nowMs();

  try {
    const { report, sources, researchedQuery } = await runDot(dot);

    const artifact = {
      id: entryId(),
      ts: startedAt,
      title: `Session #${(dot.runCount || 0) + 1}${researchedQuery ? " · researched" : ""}`,
      body: report,
      sources: (sources || []).map((s) => ({ n: s.n, title: s.title, url: s.url })),
    };
    dot.artifacts = [...(dot.artifacts || []), artifact].slice(-MAX_ARTIFACTS);
    dot.activity = [
      ...(dot.activity || []),
      {
        id: entryId(),
        ts: startedAt,
        kind: "report",
        text: firstLine(report) || "Progress report",
        artifactId: artifact.id,
      },
    ].slice(-MAX_ACTIVITY);

    dot.status = "idle";
    dot.runCount = (dot.runCount || 0) + 1;
    dot.lastRunAt = startedAt;
    dot.nextRunAt = startedAt + dot.cadenceMinutes * 60_000;
    dot.updatedAt = nowMs();
    persist();

    // Anything a dot learns becomes durable memory, so the user's next chat
    // already knows what the dot found.
    try {
      await rememberFact({
        text: `${dot.emoji} ${dot.name}: ${firstLine(report) || report.slice(0, 300)}`,
        source: `dot:${dot.id}`,
      });
    } catch {
      /* memory is best-effort */
    }

    emitDotEvent({
      kind: "finished",
      dotId: dot.id,
      name: dot.name,
      ok: true,
      preview: firstLine(report),
      artifactId: artifact.id,
    });
    return { ok: true, dot: publicDot(dot), artifact };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    dot.status = "error";
    dot.lastRunAt = startedAt;
    // Back off so a broken dot doesn't hammer the model, but keep trying.
    const backoff = Math.min(Math.max(dot.cadenceMinutes, 10), 120);
    dot.nextRunAt = startedAt + backoff * 60_000;
    dot.activity = [
      ...(dot.activity || []),
      { id: entryId(), ts: startedAt, kind: "error", text: message },
    ].slice(-MAX_ACTIVITY);
    dot.updatedAt = nowMs();
    persist();
    emitDotEvent({ kind: "finished", dotId: dot.id, name: dot.name, ok: false, error: message });
    return { ok: false, error: message, dot: publicDot(dot) };
  }
}

function firstLine(text) {
  const line = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .find((l) => l.length > 0);
  return line ? line.slice(0, 200) : "";
}

/** Record feedback and turn it into a learning the dot will respect. */
export async function recordFeedback(id, { rating, note }) {
  const list = await load();
  const dot = list.find((d) => d.id === id);
  if (!dot) throw new Error("dot not found");
  applyFeedback(dot, { rating, note });
  persist();
  emitDotEvent({ kind: "feedback", dotId: dot.id });
  return publicDot(dot);
}

// ---------- scheduler ------------------------------------------------------

let timer = null;
let kickoff = null;
let running = false;

/** Wake every due, enabled dot — one at a time so the model isn't swamped. */
export async function runDueDots(now = nowMs()) {
  if (running) return [];
  running = true;
  const results = [];
  try {
    const list = await load();
    const due = selectDueDots(list, now);
    for (const d of due) {
      try {
        results.push(await runDotNow(d.id));
      } catch (err) {
        results.push({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return results;
  } finally {
    running = false;
  }
}

export function startDotsScheduler({ intervalMs = 30_000, kickoffMs = 5_000 } = {}) {
  if (process.env.TALIA_DOTS_DISABLED === "1") return;
  if (timer) return;
  timer = setInterval(() => {
    void runDueDots();
  }, intervalMs);
  timer.unref?.();
  kickoff = setTimeout(() => {
    void runDueDots();
  }, kickoffMs);
  kickoff.unref?.();
}

export function stopDotsScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  // Also cancel a pending boot kick-off, or it would fire after shutdown.
  if (kickoff) {
    clearTimeout(kickoff);
    kickoff = null;
  }
}
