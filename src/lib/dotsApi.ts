// Client for Talia's Dots (always-on agent) API, mirroring server/dots.mjs.
import type { ProviderConfig } from "../types";
import { apiUrl } from "./appMode";

export interface DotActivity {
  id: string;
  ts: number;
  kind: "note" | "report" | "error";
  text: string;
  artifactId?: string;
}

export interface DotSource {
  n: number;
  title: string;
  url: string;
}

export interface DotArtifact {
  id: string;
  ts: number;
  title: string;
  body: string;
  sources?: DotSource[];
}

export interface Dot {
  id: string;
  name: string;
  emoji: string;
  goal: string;
  instructions: string;
  autonomy: "act" | "suggest";
  cadenceMinutes: number;
  enabled: boolean;
  status: "idle" | "working" | "error";
  createdAt: number;
  updatedAt: number;
  lastRunAt: number | null;
  nextRunAt: number | null;
  runCount: number;
  model: string;
  provider: { baseUrl: string } | null;
  activity: DotActivity[];
  artifacts: DotArtifact[];
  learnings: string[];
  feedback: { ts: number; rating: string; note: string }[];
}

export interface DotEvent {
  kind: "created" | "updated" | "deleted" | "started" | "finished" | "feedback" | string;
  dotId?: string;
  name?: string;
  ok?: boolean;
  preview?: string;
  error?: string;
  artifactId?: string;
  ts: number;
}

export interface DotInput {
  name: string;
  emoji: string;
  goal: string;
  instructions?: string;
  cadenceMinutes: number;
  autonomy: "act" | "suggest";
  provider?: ProviderConfig;
  model?: string;
}

async function jsonReq<T>(path: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(apiUrl(path), {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await r.json()) as T;
}

export async function fetchDots(): Promise<Dot[]> {
  try {
    const j = await jsonReq<{ ok: boolean; dots: Dot[] }>("/api/dots", "GET");
    return j?.ok ? j.dots : [];
  } catch {
    return [];
  }
}

export async function createDot(input: DotInput): Promise<{ ok: boolean; dot?: Dot; error?: string }> {
  return jsonReq("/api/dots", "POST", input);
}

export async function updateDot(
  id: string,
  patch: Partial<Omit<DotInput, "name" | "goal">> & { name?: string; goal?: string; enabled?: boolean },
): Promise<{ ok: boolean; dot?: Dot; error?: string }> {
  return jsonReq(`/api/dots/${encodeURIComponent(id)}`, "PATCH", patch);
}

export async function deleteDot(id: string): Promise<boolean> {
  try {
    return (await jsonReq<{ ok: boolean }>(`/api/dots/${encodeURIComponent(id)}`, "DELETE")).ok === true;
  } catch {
    return false;
  }
}

export async function runDotNow(id: string): Promise<{ ok: boolean; error?: string; dot?: Dot }> {
  return jsonReq(`/api/dots/${encodeURIComponent(id)}/run`, "POST", {});
}

/**
 * Register the current provider key with the server. It is held in memory only
 * (never persisted) so cloud-backed dots can run unattended. Call on load and
 * whenever the provider changes.
 */
export async function armDots(provider: ProviderConfig): Promise<{ ok: boolean; count: number }> {
  if (!provider?.baseUrl || !provider.apiKey) return { ok: false, count: 0 };
  try {
    return await jsonReq<{ ok: boolean; count: number }>("/api/dots/arm", "POST", {
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
    });
  } catch {
    return { ok: false, count: 0 };
  }
}

export async function sendDotFeedback(
  id: string,
  feedback: { rating: "up" | "down" | "note"; note?: string },
): Promise<{ ok: boolean; dot?: Dot }> {
  return jsonReq(`/api/dots/${encodeURIComponent(id)}/feedback`, "POST", feedback);
}

/**
 * Subscribe to the proactive dot event stream. Returns a cleanup function.
 * EventSource auto-reconnects, so this is safe to leave running while the
 * panel is open.
 */
export function subscribeDotEvents(onEvent: (event: DotEvent) => void): () => void {
  if (typeof EventSource === "undefined") return () => {};
  let source: EventSource | null = null;
  try {
    source = new EventSource(apiUrl("/api/dots/events"));
  } catch {
    return () => {};
  }
  const handler = (e: MessageEvent) => {
    try {
      onEvent(JSON.parse(e.data) as DotEvent);
    } catch {
      /* ignore malformed */
    }
  };
  source.addEventListener("dot", handler as EventListener);
  return () => {
    source?.removeEventListener("dot", handler as EventListener);
    source?.close();
  };
}

export function formatCadence(minutes: number): string {
  if (minutes < 60) return `every ${minutes}m`;
  if (minutes % 60 === 0) return `every ${minutes / 60}h`;
  return `every ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function relativeTime(ts: number | null): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  const future = diff < 0;
  let label: string;
  if (abs < 60_000) label = "just now";
  else if (mins < 60) label = `${mins}m`;
  else if (mins < 1440) label = `${Math.round(mins / 60)}h`;
  else label = `${Math.round(mins / 1440)}d`;
  if (abs < 60_000) return future ? "soon" : label;
  return future ? `in ${label}` : `${label} ago`;
}
