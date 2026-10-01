// Shared client for Talia's built-in AI engine (runtime).
import { apiUrl } from "./appMode";

export interface RuntimeModel {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  blurb: string;
  recommended: boolean;
  downloaded: boolean;
  bytes: number;
}

export interface RuntimeStatus {
  platform: string;
  arch: string;
  supported: boolean;
  targetLabel: string;
  accelerator: string | null;
  device: string;
  ramGB: number;
  recommendedBrain: string;
  installed: boolean;
  version: string | null;
  running: boolean;
  baseUrl: string;
  port: number;
  selectedModel: string | null;
  autoStart: boolean;
  models: RuntimeModel[];
  lastExit: { code: number | null; signal: string | null; at: number } | null;
  recentLogs: string[];
}

export interface RuntimeProgress {
  phase?: string;
  message?: string;
  pct?: number | null;
  error?: string;
}

export async function fetchRuntimeStatus(): Promise<RuntimeStatus | null> {
  try {
    const r = await fetch(apiUrl("/api/runtime/status"));
    const j = await r.json();
    return j?.ok ? (j as RuntimeStatus) : null;
  } catch {
    return null;
  }
}

/** Consume a runtime SSE endpoint (engine install / brain download / quickstart). */
export function streamRuntime(
  path: string,
  body: Record<string, unknown>,
  onEvent: (evt: RuntimeProgress) => void,
): Promise<{ ok?: boolean; error?: string; version?: string; model?: string }> {
  return new Promise((resolve) => {
    fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => {
        if (!r.ok || !r.body) {
          resolve({ error: `HTTP ${r.status}` });
          return;
        }
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        const step = () => {
          reader
            .read()
            .then(({ done, value }) => {
              if (done) {
                resolve({});
                return;
              }
              buf += dec.decode(value, { stream: true });
              let nl: number;
              while ((nl = buf.indexOf("\n")) !== -1) {
                const line = buf.slice(0, nl).trim();
                buf = buf.slice(nl + 1);
                if (!line.startsWith("data:")) continue;
                try {
                  const evt = JSON.parse(line.slice(5).trim()) as RuntimeProgress & {
                    phase?: string;
                  };
                  if (evt.phase === "complete" || evt.phase === "error") {
                    resolve(evt);
                    reader.cancel().catch(() => {});
                    return;
                  }
                  onEvent(evt);
                } catch {
                  /* skip */
                }
              }
              step();
            })
            .catch((err) => resolve({ error: err.message }));
        };
        step();
      })
      .catch((err) => resolve({ error: err.message }));
  });
}

export async function startEngine(
  modelId?: string,
): Promise<{ ok: boolean; error?: string; model?: string }> {
  try {
    const r = await fetch(apiUrl("/api/runtime/start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(modelId ? { modelId } : {}),
    });
    return (await r.json()) as { ok: boolean; error?: string; model?: string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function stopEngine(): Promise<void> {
  try {
    await fetch(apiUrl("/api/runtime/stop"), { method: "POST" });
  } catch {
    /* best effort */
  }
}

export async function deleteBrain(id: string): Promise<void> {
  try {
    await fetch(apiUrl(`/api/runtime/models/${encodeURIComponent(id)}`), { method: "DELETE" });
  } catch {
    /* best effort */
  }
}
