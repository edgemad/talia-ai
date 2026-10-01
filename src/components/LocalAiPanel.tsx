// 🧠 Built-in AI panel — Talia's own engine, zero drivers required.
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, RefreshCw, Sparkles, Square, Trash2, Download, CircleCheck } from "lucide-react";
import { apiUrl } from "../lib/appMode";

interface RuntimeModel {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  blurb: string;
  recommended: boolean;
  downloaded: boolean;
  bytes: number;
}

interface RuntimeStatus {
  platform: string;
  arch: string;
  supported: boolean;
  targetLabel: string;
  accelerator: string | null;
  installed: boolean;
  version: string | null;
  running: boolean;
  baseUrl: string;
  selectedModel: string | null;
  device: string;
  ramGB: number;
  recommendedBrain: string;
  models: RuntimeModel[];
  lastExit: { code: number | null; signal: string | null; at: number } | null;
  recentLogs: string[];
}

/** Consume one of the runtime SSE endpoints (install / model download). */
function streamRuntime(
  path: string,
  body: Record<string, unknown>,
  onEvent: (evt: { phase?: string; message?: string; pct?: number | null; error?: string }) => void,
): Promise<{ ok?: boolean; error?: string; version?: string }> {
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
                  const evt = JSON.parse(line.slice(5).trim());
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

export function LocalAiPanel({ onUseThisEngine }: { onUseThisEngine?: () => void }) {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ msg: string; pct: number | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/runtime/status"));
      const j = await r.json();
      if (alive.current && j?.ok) setStatus(j as RuntimeStatus);
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [refresh]);

  /** One tap: engine + the brain that fits this machine + start + verified. */
  const quickstart = async () => {
    setBusy("quickstart");
    setProgress({ msg: "Preparing…", pct: null });
    const r = await streamRuntime("/api/runtime/quickstart", {}, (evt) =>
      setProgress({ msg: evt.message ?? "Working…", pct: evt.pct ?? null }),
    );
    setBusy(null);
    setProgress(null);
    setNotice(
      r.error
        ? `Setup paused: ${r.error} — press the button again anytime`
        : "Talia's own AI is ready — no drivers, nothing else to install ♡",
    );
    void refresh();
  };

  const removeEverything = async () => {
    if (!window.confirm("Remove Talia's engine and all downloaded brains? Chat history and memories stay.")) return;
    setBusy("uninstall");
    await fetch(apiUrl("/api/runtime/uninstall"), { method: "POST" });
    setBusy(null);
    setNotice("Engine and brains removed — reinstall anytime with one tap.");
    void refresh();
  };

  const downloadModelById = async (id: string) => {
    setBusy(`model:${id}`);
    setProgress({ msg: "Starting download…", pct: 0 });
    const r = await streamRuntime("/api/runtime/models/download", { id }, (evt) =>
      setProgress({ msg: evt.message ?? "Downloading…", pct: evt.pct ?? null }),
    );
    setBusy(null);
    setProgress(null);
    setNotice(r.error ? `Download failed: ${r.error}` : "Model ready ✓");
    void refresh();
  };

  const start = async (modelId?: string) => {
    setBusy("start");
    const r = await fetch(apiUrl("/api/runtime/start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(modelId ? { modelId } : {}),
    });
    const j = await r.json();
    setBusy(null);
    setNotice(j.ok ? "Talia's engine is running 🧠✨" : (j.error ?? "Could not start the engine."));
    void refresh();
  };

  const stop = async () => {
    setBusy("stop");
    await fetch(apiUrl("/api/runtime/stop"), { method: "POST" });
    setBusy(null);
    void refresh();
  };

  const removeModel = async (id: string) => {
    await fetch(apiUrl(`/api/runtime/models/${encodeURIComponent(id)}`), { method: "DELETE" });
    void refresh();
  };

  if (!status) {
    return (
      <div className="flex items-center gap-2 py-3 text-[12px] font-semibold" style={{ color: "var(--text-faint)" }}>
        <Loader2 size={13} className="animate-spin" /> Checking the built-in engine…
      </div>
    );
  }

  const engineReady = status.installed;
  const downloadedModels = status.models.filter((m) => m.downloaded);
  const needsSetup = !engineReady || downloadedModels.length === 0;

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="flex items-center gap-2 rounded-2xl border px-3 py-2.5"
        style={{ borderColor: status.running ? "var(--accent)" : "var(--border)", background: "var(--surface)" }}
      >
        <span className="text-lg">🧠</span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-extrabold" style={{ color: "var(--text)" }}>
            Built-in AI engine {status.running ? "· running" : engineReady ? "· ready" : "· not installed"}
          </div>
          <div className="truncate text-[11px]" style={{ color: "var(--text-faint)" }}>
            {status.supported
              ? `${status.device} — ${status.accelerator} · no drivers, no GPU required`
              : `${status.targetLabel} — no engine build yet; use Ollama or a cloud provider here`}
            {status.version ? ` · v${status.version}` : ""}
          </div>
        </div>
        {status.running ? (
          <button
            onClick={() => void stop()}
            disabled={busy !== null}
            className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-extrabold disabled:opacity-40"
            style={{ background: "var(--surface-strong)", color: "var(--text-soft)" }}
          >
            {busy === "stop" ? <Loader2 size={11} className="animate-spin" /> : <Square size={10} fill="currentColor" />} Stop
          </button>
        ) : (
          engineReady &&
          downloadedModels.length > 0 && (
            <button
              onClick={() => void start()}
              disabled={busy !== null}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-extrabold text-white shadow-plush disabled:opacity-40"
              style={{ background: "var(--accent-grad)" }}
            >
              {busy === "start" ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />} Start
            </button>
          )
        )}
      </div>

      {needsSetup && status.supported && (
        <button
          onClick={() => void quickstart()}
          disabled={busy !== null}
          className="animate-glow flex items-center justify-center gap-2 rounded-full px-4 py-3 text-xs font-extrabold text-white shadow-plush disabled:opacity-50"
          style={{ background: "var(--accent-grad)" }}
        >
          {busy === "quickstart" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Set up Talia's AI — one tap, zero drivers
        </button>
      )}

      {progress && (
        <div className="rounded-2xl border border-dashed px-3 py-2" style={{ borderColor: "var(--border)" }}>
          <div className="text-[11px] font-bold" style={{ color: "var(--text-soft)" }}>
            {progress.msg}
          </div>
          {progress.pct !== null && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-strong)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${progress.pct}%`, background: "var(--accent-grad)" }} />
            </div>
          )}
        </div>
      )}

      {engineReady && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Brains for the engine
          </div>
          {status.models.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2.5 rounded-2xl border px-3 py-2"
              style={{
                borderColor: status.selectedModel === m.id ? "var(--accent)" : "var(--border)",
                background: "var(--surface)",
                opacity: m.downloaded || busy === null ? 1 : 0.85,
              }}
            >
              <span className="text-base">{m.id === status.recommendedBrain || m.recommended ? "⭐" : "🧩"}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-extrabold" style={{ color: "var(--text)" }}>
                  {m.name} <span className="font-bold" style={{ color: "var(--text-faint)" }}>· {m.size}</span>
                  {m.id === status.recommendedBrain && (
                    <span className="ml-1 text-[9.5px] font-extrabold" style={{ color: "var(--accent)" }}>
                      fits your machine
                    </span>
                  )}
                </div>
                <div className="truncate text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                  {m.blurb}
                </div>
              </div>
              {m.downloaded ? (
                <>
                  <button
                    onClick={() => void start(m.id)}
                    disabled={busy !== null}
                    className="rounded-full px-2.5 py-1 text-[10.5px] font-extrabold text-white shadow-plush disabled:opacity-40"
                    style={{ background: "var(--accent-grad)" }}
                    title="Downloaded — use this brain"
                  >
                    {status.running && status.selectedModel === m.id ? <CircleCheck size={11} /> : "Use"}
                  </button>
                  {!status.running && (
                    <button
                      onClick={() => void removeModel(m.id)}
                      className="rounded-full p-1 transition hover:bg-rose-500/10"
                      style={{ color: "var(--text-faint)" }}
                      aria-label={`Delete ${m.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => void downloadModelById(m.id)}
                  disabled={busy !== null}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold disabled:opacity-40"
                  style={{ background: "var(--surface-strong)", color: "var(--text-soft)" }}
                >
                  {busy === `model:${m.id}` ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                  Get
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {notice && (
        <div className="text-[11px] font-bold" style={{ color: "var(--accent)" }}>
          {notice}
        </div>
      )}

      {onUseThisEngine && status.running && (
        <button
          onClick={onUseThisEngine}
          className="flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-extrabold"
          style={{ background: "var(--surface-strong)", color: "var(--text-soft)" }}
        >
          <RefreshCw size={11} /> Use this engine for chat (localhost:11435)
        </button>
      )}

      {engineReady && !status.running && (
        <button
          onClick={() => void removeEverything()}
          disabled={busy !== null}
          className="self-start text-[10px] font-bold underline decoration-dotted transition hover:text-rose-400"
          style={{ color: "var(--text-faint)" }}
        >
          {busy === "uninstall" ? "Removing…" : "Remove engine & brains from this device"}
        </button>
      )}

      {status.lastExit && !status.running && (
        <div className="text-[10px] font-semibold" style={{ color: "var(--text-faint)" }}>
          Engine exited unexpectedly {status.lastExit.code ? `(code ${status.lastExit.code})` : ""} — Talia restarts it automatically (up to 3×).
        </div>
      )}
    </div>
  );
}
