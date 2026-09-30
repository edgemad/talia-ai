// Client for Talia's v2 server features.
import type { CatalogModel, ChatMessage, MemoryItem, ResearchSource } from "../types";

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  return (await r.json()) as T;
}

// ---------- Sessions ------------------------------------------------------
export async function loadServerSessions(): Promise<unknown[] | null> {
  try {
    const r = await fetch("/api/sessions");
    const j = await r.json();
    return j?.ok ? j.sessions : null;
  } catch {
    return null;
  }
}

export async function saveServerSessions(sessions: unknown): Promise<boolean> {
  try {
    const r = await fetch("/api/sessions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions }),
    });
    return (await r.json())?.ok === true;
  } catch {
    return false;
  }
}

// ---------- Memory ---------------------------------------------------------
export async function fetchMemory(): Promise<MemoryItem[]> {
  try {
    const r = await fetch("/api/memory");
    const j = await r.json();
    return j?.ok ? j.items : [];
  } catch {
    return [];
  }
}

export async function rememberText(text: string, sessionId: string | null) {
  return postJson<{ ok: boolean }>("/api/memory", { text, source: "manual", sessionId });
}

export async function rememberExchange(userText: string, assistantText: string, sessionId: string | null) {
  return postJson<{ ok: boolean; saved: number }>("/api/memory/remember-exchange", {
    userText,
    assistantText,
    sessionId,
  });
}

export async function recallMemory(query: string, limit = 6): Promise<MemoryItem[]> {
  try {
    const j = await postJson<{ ok: boolean; hits: MemoryItem[] }>("/api/memory/recall", { query, limit });
    return j?.hits ?? [];
  } catch {
    return [];
  }
}

export async function forgetMemoryItem(id: string) {
  await fetch(`/api/memory/${id}`, { method: "DELETE" });
}

export async function forgetAllMemory() {
  await fetch("/api/memory", { method: "DELETE" });
}

// ---------- Research --------------------------------------------------------
export interface ResearchResult {
  ok: boolean;
  engine?: string;
  sources?: ResearchSource[];
  context?: string;
  quickAnswer?: string;
  error?: string;
}

export async function runResearch(query: string, maxSources = 5, signal?: AbortSignal): Promise<ResearchResult> {
  return postJson<ResearchResult>("/api/research", { query, maxSources }, signal);
}

// ---------- Media -----------------------------------------------------------
export interface MediaResult {
  ok: boolean;
  kind?: "image" | "audio" | "video";
  mime?: string;
  dataUrl?: string;
  backend?: string;
  error?: string;
}

export const generateImage = (body: Record<string, unknown>) =>
  postJson<MediaResult>("/api/media/image", body);

export function speakText(
  textOrOpts: string | { text: string; voice?: string; ttsUrl?: string },
) {
  const body = typeof textOrOpts === "string" ? { text: textOrOpts } : textOrOpts;
  return postJson<MediaResult>("/api/media/tts", body);
}

export const generateVideo = (body: Record<string, unknown>) =>
  postJson<MediaResult>("/api/media/video", body);

// ---------- Model catalog ----------------------------------------------------
export async function fetchCatalog(): Promise<CatalogModel[]> {
  try {
    const r = await fetch("/api/models/catalog");
    const j = await r.json();
    return j?.catalog ?? [];
  } catch {
    return [];
  }
}

export async function pullModel(
  baseUrl: string,
  model: string,
  onProgress: (status: string, pct: number | null) => void,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/models/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl, model }),
    });
    if (!res.ok || !res.body) return { ok: false, error: `pull failed (${res.status})` };

    const reader = res.body.getReader();
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
        if (!line.startsWith("data:")) continue;
        try {
          const evt = JSON.parse(line.slice(5).trim());
          if (evt.error) return { ok: false, error: evt.error };
          if (evt.status === "success" || evt.status === "done") {
            onProgress("done ✓", 100);
            return { ok: true };
          }
          const pct = evt.total ? Math.round(((evt.completed || 0) / evt.total) * 100) : null;
          onProgress(evt.status || "pulling…", pct);
        } catch {
          /* skip malformed */
        }
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------- helpers ----------------------------------------------------------
export function buildResearchSystem(context: string): string {
  return context;
}

export function sourcesFooter(sources: ResearchSource[]): string {
  return sources.map((s) => `[${s.n}] ${s.title} — ${s.url}`).join("\n");
}

export type { ChatMessage };
