// Long-term cross-chat memory: embeddings + keyword relevance, recency decay,
// deduplicated facts and conversation snippets. All local, all JSON.
import { readCollection, writeCollection } from "./store.mjs";
import { embed, relevance, tokenize } from "./embeddings.mjs";

const COLLECTION = "memory";
let items = null;

const HALF_LIFE_DAYS = 21;
const MAX_ITEMS = 2000;

async function load() {
  if (!items) {
    items = await readCollection(COLLECTION, []);
    if (!Array.isArray(items)) items = [];
  }
  return items;
}

function persist() {
  writeCollection(COLLECTION, items);
}

function recencyScore(ts, now = Date.now()) {
  const ageDays = Math.max(0, (now - ts) / 86_400_000);
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

export async function rememberFact({ text, source, sessionId }) {
  const list = await load();
  const clean = String(text || "").trim().slice(0, 1200);
  if (!clean) return null;

  // Deduplicate: skip near-duplicates of anything already stored
  const qv = embed(clean);
  for (const it of list) {
    const r = relevance(clean, qv, it.text);
    if (r > 0.82) {
      it.ts = Date.now(); // refresh what we already know
      it.count = (it.count || 1) + 1;
      persist();
      return { ...it, merged: true };
    }
  }

  const item = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    text: clean,
    source: source || "manual",
    sessionId: sessionId || null,
    ts: Date.now(),
    count: 1,
    vec: qv,
  };
  list.push(item);

  // Cap memory: drop lowest (relevance-less) oldest items first
  if (list.length > MAX_ITEMS) {
    list.sort((a, b) => b.ts - a.ts);
    list.length = MAX_ITEMS;
  }
  persist();
  return item;
}

export async function recall(query, { limit = 6, minScore = 0.18 } = {}) {
  const list = await load();
  if (list.length === 0) return [];
  const qv = embed(query);
  const scored = list
    .map((it) => ({
      id: it.id,
      text: it.text,
      source: it.source,
      ts: it.ts,
      score: relevance(query, qv, it.text) * (0.35 + 0.65 * recencyScore(it.ts)),
    }))
    .filter((it) => it.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored;
}

export async function listMemory() {
  const list = await load();
  return [...list]
    .sort((a, b) => b.ts - a.ts)
    .map(({ vec, ...rest }) => rest);
}

export async function forgetFact(id) {
  const list = await load();
  const before = list.length;
  items = list.filter((it) => it.id !== id);
  persist();
  return items.length < before;
}

export async function forgetAll() {
  items = [];
  persist();
}

/** Break raw chat text into memorable snippet candidates. */
export function snippetCandidates(text) {
  return tokenizeLength(String(text || ""));
}

function tokenizeLength(t) {
  return t
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 400);
}
