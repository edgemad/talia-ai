// Client for the Games Arcade — built-ins, catalogue packs and live sessions.
// All calls go through apiUrl() so the Android thin client works over WiFi.
import { apiUrl } from "./appMode";
import type { ProviderConfig } from "../types";

export interface GameDef {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  category: string;
  ages: string;
  needsLlm: boolean;
  howTo: string;
  builtin: boolean;
  installed: boolean;
  source: "builtin" | "pack";
}

export interface CatalogueEntry {
  id: string;
  engine: string;
  name: string;
  emoji: string;
  tagline: string;
  category: string;
  ages: string;
  howTo: string;
  installed: boolean;
  items: number;
}

export interface ActiveGame {
  sessionId: string;
  gameId: string;
  name: string;
  emoji: string;
  howTo?: string;
  state: Record<string, unknown>;
}

export interface GameMoveHandlers {
  onState: (state: Record<string, unknown>) => void;
  onToken: (token: string) => void;
  onEngineReply: (text: string) => void;
  onDone: (status: string | null, summary: string | null) => void;
  onError: (message: string) => void;
}

export async function fetchGames(): Promise<GameDef[]> {
  try {
    const r = await fetch(apiUrl("/api/games"));
    const j = await r.json();
    return j?.ok ? j.games : [];
  } catch {
    return [];
  }
}

export async function fetchGameCatalogue(): Promise<CatalogueEntry[]> {
  try {
    const r = await fetch(apiUrl("/api/games/catalogue"));
    const j = await r.json();
    return j?.ok ? j.catalogue : [];
  } catch {
    return [];
  }
}

export async function installGame(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(apiUrl("/api/games/install"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    return (await r.json()) as { ok: boolean; error?: string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function uninstallGame(id: string): Promise<boolean> {
  try {
    const r = await fetch(apiUrl("/api/games/uninstall"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    return (await r.json())?.ok === true;
  } catch {
    return false;
  }
}

export async function startGame(
  gameId: string,
  chatId: string,
): Promise<{ ok: boolean; error?: string; session?: ActiveGame; intro?: string }> {
  try {
    const r = await fetch(apiUrl("/api/games/start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, chatId }),
    });
    const j = await r.json();
    if (!j?.ok) return { ok: false, error: j?.error ?? `HTTP ${r.status}` };
    return {
      ok: true,
      intro: j.intro,
      session: {
        sessionId: j.sessionId,
        gameId: j.game.id,
        name: j.game.name,
        emoji: j.game.emoji,
        howTo: j.game.howTo,
        state: j.state,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Submit a move; consumes the normalized SSE stream (state → tokens/engine → done). */
export async function gameMove(
  sessionId: string,
  text: string,
  provider: ProviderConfig,
  model: string,
  handlers: GameMoveHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/games/${encodeURIComponent(sessionId)}/move`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, provider, model }),
      signal,
    });
  } catch (err) {
    if (!signal?.aborted) handlers.onError(err instanceof Error ? err.message : String(err));
    return;
  }
  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* keep default */
    }
    handlers.onError(msg);
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === "state") handlers.onState(evt.state ?? {});
          else if (evt.type === "token") handlers.onToken(evt.token ?? "");
          else if (evt.type === "engine") handlers.onEngineReply(evt.text ?? "");
          else if (evt.type === "done") handlers.onDone(evt.status ?? null, evt.summary ?? null);
          else if (evt.type === "error") handlers.onError(evt.error ?? "Game error");
        } catch {
          /* skip malformed */
        }
      }
    }
  } catch (err) {
    if (!signal?.aborted) handlers.onError(err instanceof Error ? err.message : String(err));
  }
}

export async function endGame(sessionId: string): Promise<void> {
  try {
    await fetch(apiUrl(`/api/games/${encodeURIComponent(sessionId)}/end`), { method: "POST" });
  } catch {
    /* session TTLs out anyway */
  }
}
