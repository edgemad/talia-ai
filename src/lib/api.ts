import type { ProviderConfig, Role } from "../types";
import { apiUrl } from "./appMode";

export interface StreamHandlers {
  onToken: (token: string) => void;
  onDone: (reason: "done" | "stopped" | "error") => void;
  onError: (message: string) => void;
}

/** POST to our proxy and consume the normalized SSE token stream. */
export async function streamChat(
  provider: ProviderConfig,
  model: string,
  messages: { role: Role; content: string }[],
  handlers: StreamHandlers,
  signal?: AbortSignal,
  requestId?: string,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(apiUrl("/api/chat"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(requestId ? { "X-Request-Id": requestId } : {}),
      },
      body: JSON.stringify({ provider, model, messages }),
      signal,
    });
  } catch (err) {
    handlers.onError(
      `Talia can't reach her server: ${err instanceof Error ? err.message : String(err)}`,
    );
    handlers.onDone("error");
    return;
  }

  if (!res.ok || !res.body) {
    let msg = `Server error ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* keep default */
    }
    handlers.onError(msg);
    handlers.onDone("error");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          handlers.onDone("done");
          return;
        }
        try {
          const evt = JSON.parse(payload);
          if (evt.type === "token") {
            handlers.onToken(evt.token ?? "");
            if (evt.finish) {
              handlers.onDone("done");
              return;
            }
          } else if (evt.type === "error") {
            handlers.onError(evt.error ?? "Unknown stream error");
            handlers.onDone("error");
            return;
          }
        } catch {
          // malformed chunk — skip
        }
      }
    }
    handlers.onDone("done");
  } catch (err) {
    if (signal?.aborted) {
      handlers.onDone("stopped");
    } else {
      handlers.onError(err instanceof Error ? err.message : String(err));
      handlers.onDone("error");
    }
  }
}

export async function fetchProviderHealth(baseUrl: string): Promise<{ online: boolean; status: number }> {
  try {
    const res = await fetch(
      apiUrl(`/api/provider/health?baseUrl=${encodeURIComponent(baseUrl)}`),
    );
    return await res.json();
  } catch {
    return { online: false, status: 0 };
  }
}

export interface DiscoveredModel {
  id: string;
}

export async function fetchModels(
  baseUrl: string,
): Promise<{ ok: boolean; models: DiscoveredModel[]; error?: string }> {
  try {
    const res = await fetch(
      apiUrl(`/api/provider/models?baseUrl=${encodeURIComponent(baseUrl)}`),
    );
    const body = await res.json();
    if (!res.ok || !body?.ok) {
      return { ok: false, models: [], error: body?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, models: body.models ?? [] };
  } catch (err) {
    return {
      ok: false,
      models: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
