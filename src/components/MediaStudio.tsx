import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Image as ImageIcon, AudioLines, Film, Loader2, SlidersHorizontal, Sparkles, Download, Trash2, CircleCheck } from "lucide-react";
import { Modal } from "./ui";
import { generateImage, generateVideo, speakText, type MediaResult } from "../lib/serverApi";
import { apiUrl } from "../lib/appMode";

/** Consume a runtime-style SSE endpoint (image engine install / model download). */
function streamSd(
  path: string,
  body: Record<string, unknown>,
  onEvent: (evt: { phase?: string; message?: string; pct?: number | null; error?: string }) => void,
): Promise<{ ok?: boolean; error?: string }> {
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

interface SdModelInfo {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  blurb: string;
  recommended: boolean;
  downloaded: boolean;
  bytes: number;
}

interface SdStatus {
  supported: boolean;
  targetLabel: string;
  accelerator: string | null;
  installed: boolean;
  version: string | null;
  selectedModel: string;
  models: SdModelInfo[];
  busy: boolean;
  recommendedModel: string;
}

type Tab = "image" | "audio" | "video";

/** Quality presets for image generation (steps + CFG + resolution). */
const IMAGE_QUALITY = {
  draft: { label: "💨 Draft", steps: 20, cfg: 6.5, size: 512, hires: false },
  fine: { label: "✨ Fine", steps: 32, cfg: 7, size: 768, hires: false },
  max: { label: "🏆 Max", steps: 45, cfg: 7.5, size: 1024, hires: true },
} as const;
type QualityKey = keyof typeof IMAGE_QUALITY;

const SIZES = [512, 640, 768, 1024] as const;

const inputStyle = {
  background: "var(--surface-strong)",
  borderColor: "var(--border)",
  color: "var(--text)",
} as const;

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="flex items-center justify-between text-[11px] font-bold" style={{ color: "var(--text-soft)" }}>
        <span>{label}</span>
        <span className="font-mono">
          {value}
          {suffix}
        </span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </div>
  );
}

export function MediaStudio({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("image");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MediaResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Image settings
  const [quality, setQuality] = useState<QualityKey>("fine");
  const [negative, setNegative] = useState("");
  const [width, setWidth] = useState<number>(768);
  const [height, setHeight] = useState<number>(768);
  const [imageBackend, setImageBackend] = useState("");
  const [stepsOverride, setStepsOverride] = useState<number | null>(null);
  const [cfgOverride, setCfgOverride] = useState<number | null>(null);

  // Video settings
  const [seconds, setSeconds] = useState(3);
  const [fps, setFps] = useState(12);
  const [videoSize, setVideoSize] = useState(512);

  // TTS settings
  const [voice, setVoice] = useState("");
  const [ttsUrl, setTtsUrl] = useState("");

  // Built-in image engine (stable-diffusion.cpp)
  const [sd, setSd] = useState<SdStatus | null>(null);
  const [sdBusy, setSdBusy] = useState<string | null>(null);
  const [sdProgress, setSdProgress] = useState<{ msg: string; pct: number | null } | null>(null);
  const [sdNotice, setSdNotice] = useState<string | null>(null);
  const [showEngine, setShowEngine] = useState(false);

  const refreshSd = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/runtime/sd/status"));
      const j = await r.json();
      if (j?.ok) setSd(j as SdStatus);
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refreshSd();
    const t = setInterval(() => void refreshSd(), 6000);
    return () => clearInterval(t);
  }, [open, refreshSd]);

  const installEngine = async () => {
    setSdBusy("install");
    setSdProgress({ msg: "Preparing…", pct: null });
    const r = await streamSd("/api/runtime/sd/install", {}, (evt) =>
      setSdProgress({ msg: evt.message ?? "Working…", pct: evt.pct ?? null }),
    );
    setSdBusy(null);
    setSdProgress(null);
    setSdNotice(r.error ? `Setup paused: ${r.error}` : "Image engine ready — now pick a model below ♡");
    void refreshSd();
  };

  const downloadModel = async (id: string) => {
    setSdBusy(`model:${id}`);
    setSdProgress({ msg: "Starting download…", pct: 0 });
    const r = await streamSd("/api/runtime/sd/models/download", { id }, (evt) =>
      setSdProgress({ msg: evt.message ?? "Downloading…", pct: evt.pct ?? null }),
    );
    setSdBusy(null);
    setSdProgress(null);
    setSdNotice(r.error ? `Download failed: ${r.error}` : "Model ready — press Create ♡");
    void refreshSd();
  };

  const removeModel = async (id: string) => {
    await fetch(apiUrl(`/api/runtime/sd/models/${encodeURIComponent(id)}`), { method: "DELETE" });
    void refreshSd();
  };

  // Which brain paints today: the studio's own pick, else the server default.
  const [preferredModel, setPreferredModel] = useState<string>("");
  useEffect(() => {
    if (sd && !preferredModel) setPreferredModel(sd.selectedModel || sd.recommendedModel || "sd-turbo");
  }, [sd, preferredModel]);

  const sdReady = !!sd?.installed && !!sd?.models.some((m) => m.downloaded);
  const needsSdSetup = tab === "image" && sd?.supported && !sdReady;
  const q = IMAGE_QUALITY[quality];
  const steps = stepsOverride ?? q.steps;
  const cfg = cfgOverride ?? q.cfg;

  const pickQuality = (k: QualityKey) => {
    setQuality(k);
    setStepsOverride(null);
    setCfgOverride(null);
    setWidth(IMAGE_QUALITY[k].size);
    setHeight(IMAGE_QUALITY[k].size);
  };

  const run = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const r =
        tab === "image"
          ? await generateImage({
              prompt,
              negative: negative || "lowres, blurry, watermark, jpeg artifacts, bad anatomy",
              steps,
              cfg,
              width,
              height,
              hires: q.hires,
              modelId: preferredModel || undefined,
              useLocal: !imageBackend,
              baseUrl: imageBackend || undefined,
            })
          : tab === "video"
            ? await generateVideo({
                prompt,
                seconds,
                fps,
                width: videoSize,
                height: videoSize,
                negative: negative || "blurry, low quality, flickering",
              })
            : await speakText({ text: prompt, voice: voice || undefined, ttsUrl: ttsUrl || undefined });
      setResult(r);
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "image", label: "Image", icon: <ImageIcon size={14} /> },
    { id: "audio", label: "Speech", icon: <AudioLines size={14} /> },
    { id: "video", label: "Video", icon: <Film size={14} /> },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Talia's Studio 🎨" icon={<span className="text-xl">🪄</span>}>
      <div className="mb-3 flex gap-1.5 rounded-full p-1" style={{ background: "var(--surface)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setResult(null);
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
              tab === t.id ? "glass-strong" : ""
            }`}
            style={{ color: tab === t.id ? "var(--text)" : "var(--text-faint)" }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <textarea
        rows={2}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={
          tab === "image"
            ? "A cozy cottage at dusk, pastel colors, soft volumetric light, highly detailed…"
            : tab === "video"
              ? "Cherry blossoms drifting over a calm pond at golden hour, dreamy…"
              : "Type something for Talia to say out loud…"
        }
        className="w-full resize-none rounded-2xl border p-3 text-sm outline-none focus:border-accent"
        style={inputStyle}
      />

      {tab === "image" && (
        <div className="mt-3">
          <div className="flex gap-1.5">
            {(Object.keys(IMAGE_QUALITY) as QualityKey[]).map((k) => (
              <button
                key={k}
                onClick={() => pickQuality(k)}
                className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-extrabold transition ${
                  quality === k ? "glass-strong" : "glass-pill hover:brightness-105"
                }`}
                style={{ color: quality === k ? "var(--text)" : "var(--text-faint)" }}
              >
                {IMAGE_QUALITY[k].label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-center text-[10px] font-semibold" style={{ color: "var(--text-faint)" }}>
            {steps} steps · CFG {cfg} · {width}×{height}
            {q.hires ? " · hi-res fix" : ""}
          </p>
        </div>
      )}

      {tab === "video" && (
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Slider label="Seconds" value={seconds} min={1} max={8} onChange={setSeconds} suffix="s" />
          <Slider label="FPS" value={fps} min={6} max={24} onChange={setFps} />
          <div>
            <label className="block text-[11px] font-bold" style={{ color: "var(--text-soft)" }}>
              Size
            </label>
            <select
              value={videoSize}
              onChange={(e) => setVideoSize(Number(e.target.value))}
              className="w-full rounded-xl border px-2 py-1 text-[12px] font-bold outline-none focus:border-accent"
              style={inputStyle}
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}²
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {tab === "audio" && (
        <input
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          placeholder="Voice name (optional — e.g. en_US-amy-medium)"
          className="mt-3 w-full rounded-2xl border px-3 py-2 text-[13px] outline-none focus:border-accent"
          style={inputStyle}
        />
      )}

      {tab === "image" && needsSdSetup && sd?.supported && (
        <div
          className="mt-3 rounded-2xl border p-3"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🎨</span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-extrabold" style={{ color: "var(--text)" }}>
                Paint with Talia's own engine
              </div>
              <div className="text-[10.5px] font-semibold" style={{ color: "var(--text-faint)" }}>
                {sd.installed ? "Engine ready — grab a paint brain below." : `${sd.targetLabel} · no drivers, nothing else to install`}
              </div>
            </div>
          </div>
          {!sd.installed ? (
            <button
              onClick={() => void installEngine()}
              disabled={sdBusy !== null}
              className="animate-glow mt-2.5 flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-extrabold text-white shadow-plush disabled:opacity-50"
              style={{ background: "var(--accent-grad)" }}
            >
              {sdBusy === "install" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              Install image engine — one tap
            </button>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5">
              {sd.models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => void downloadModel(m.id)}
                  disabled={sdBusy !== null}
                  className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition disabled:opacity-50"
                  style={{ background: "var(--surface-strong)" }}
                >
                  <span className="text-sm">{m.recommended || m.id === sd.recommendedModel ? "⭐" : "🎨"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-extrabold" style={{ color: "var(--text)" }}>
                      {m.name} · {m.size}
                    </span>
                    <span className="block truncate text-[10px]" style={{ color: "var(--text-faint)" }}>
                      {m.blurb}
                    </span>
                  </span>
                  {sdBusy === `model:${m.id}` ? <Loader2 size={11} className="animate-spin" /> : <Download size={12} />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "image" && sdReady && (
        <button
          onClick={() => setShowEngine((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-accent-2"
        >
          <Sparkles size={11} /> {showEngine ? "Hide" : "Image engine & models"}
        </button>
      )}

      {showEngine && sd && (
        <div className="mt-2 flex flex-col gap-1.5 rounded-2xl border border-dashed p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="text-[10px] font-extrabold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Paint brains {sd.version ? `· engine v${sd.version}` : ""} {sd.accelerator ? `· ${sd.accelerator}` : ""}
          </div>
          {sd.models.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-xl px-2.5 py-1.5"
              style={{ background: "var(--surface-strong)", border: preferredModel === m.id ? "1px solid var(--accent)" : "1px solid transparent" }}
            >
              <span className="text-sm">{m.id === sd.recommendedModel || m.recommended ? "⭐" : "🎨"}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11.5px] font-extrabold" style={{ color: "var(--text)" }}>
                  {m.name} <span className="font-bold" style={{ color: "var(--text-faint)" }}>· {m.size}</span>
                </div>
                <div className="truncate text-[10px]" style={{ color: "var(--text-faint)" }}>
                  {m.blurb}
                </div>
              </div>
              {m.downloaded ? (
                <>
                  <button
                    onClick={() => setPreferredModel(m.id)}
                    className="rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white shadow-plush"
                    style={{ background: preferredModel === m.id ? "var(--accent-grad)" : "var(--surface-strong)", color: preferredModel === m.id ? "#fff" : "var(--text-soft)" }}
                  >
                    {preferredModel === m.id ? <CircleCheck size={10} /> : "Use"}
                  </button>
                  <button
                    onClick={() => void removeModel(m.id)}
                    className="rounded-full p-1 transition hover:bg-rose-500/10"
                    style={{ color: "var(--text-faint)" }}
                    aria-label={`Delete ${m.name}`}
                  >
                    <Trash2 size={11} />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => void downloadModel(m.id)}
                  disabled={sdBusy !== null}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold disabled:opacity-40"
                  style={{ background: "var(--surface-strong)", color: "var(--text-soft)" }}
                >
                  {sdBusy === `model:${m.id}` ? <Loader2 size={9} className="animate-spin" /> : <Download size={9} />}
                  Get
                </button>
              )}
            </div>
          ))}
          <div className="text-[10px] font-semibold" style={{ color: "var(--text-faint)" }}>
            {sd.supported
              ? `${sd.targetLabel} — no drivers, no GPU required${sd.version ? ` · engine v${sd.version}` : ""}`
              : `${sd.targetLabel} — no engine build yet; use Automatic1111 or an OpenAI-style image server`}
          </div>
        </div>
      )}

      <button
        onClick={() => setShowAdvanced((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-accent-2"
      >
        <SlidersHorizontal size={11} /> {showAdvanced ? "Hide" : "Show"} advanced controls
      </button>

      {showAdvanced && (
        <div className="mt-2 flex flex-col gap-3 rounded-2xl border border-dashed p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          {tab === "image" && (
            <>
              <Slider label="Steps (more = refined)" value={steps} min={8} max={80} onChange={setStepsOverride} />
              <Slider label="CFG (prompt strength)" value={cfg} min={1} max={14} step={0.5} onChange={setCfgOverride} />
              <div className="grid grid-cols-2 gap-3">
                <Slider label="Width" value={width} min={256} max={1536} step={64} onChange={setWidth} suffix="px" />
                <Slider label="Height" value={height} min={256} max={1536} step={64} onChange={setHeight} suffix="px" />
              </div>
              <input
                value={negative}
                onChange={(e) => setNegative(e.target.value)}
                placeholder="Negative prompt (what to avoid)"
                className="rounded-xl border px-3 py-2 text-[12px] outline-none focus:border-accent"
                style={inputStyle}
              />
              <input
                value={imageBackend}
                onChange={(e) => setImageBackend(e.target.value)}
                placeholder="Image backend URL (default http://127.0.0.1:7860)"
                className="rounded-xl border px-3 py-2 font-mono text-[11px] outline-none focus:border-accent"
                style={inputStyle}
              />
            </>
          )}
          {tab === "audio" && (
            <input
              value={ttsUrl}
              onChange={(e) => setTtsUrl(e.target.value)}
              placeholder="TTS endpoint (default TALIA_TTS_URL)"
              className="rounded-xl border px-3 py-2 font-mono text-[11px] outline-none focus:border-accent"
              style={inputStyle}
            />
          )}
          {tab === "video" && (
            <input
              value={negative}
              onChange={(e) => setNegative(e.target.value)}
              placeholder="Negative prompt (what to avoid)"
              className="rounded-xl border px-3 py-2 text-[12px] outline-none focus:border-accent"
              style={inputStyle}
            />
          )}
        </div>
      )}

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={run}
        disabled={busy || !prompt.trim()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-extrabold text-white shadow-plush disabled:opacity-40"
        style={{ background: "var(--accent-grad)" }}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : "✨"}
        {busy ? (tab === "image" ? "Painting…" : "Creating…") : tab === "image" && sdReady ? "Paint" : "Create"}
      </motion.button>

      {sdProgress && (
        <div className="mt-3 rounded-2xl border border-dashed px-3 py-2" style={{ borderColor: "var(--border)" }}>
          <div className="text-[11px] font-bold" style={{ color: "var(--text-soft)" }}>
            {sdProgress.msg}
          </div>
          {sdProgress.pct !== null && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-strong)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${sdProgress.pct}%`, background: "var(--accent-grad)" }} />
            </div>
          )}
        </div>
      )}

      {sdNotice && (
        <div className="mt-2 text-center text-[11px] font-bold" style={{ color: "var(--accent)" }}>
          {sdNotice}
        </div>
      )}

      {result && !result.ok && (
        <div
          className="mt-3 rounded-2xl border p-3 text-xs font-semibold"
          style={{ borderColor: "rgba(251,113,133,0.35)", background: "rgba(251,113,133,0.08)", color: "var(--warn)" }}
        >
          {result.error}
          {needsSdSetup && (
            <button
              onClick={() => void installEngine()}
              disabled={sdBusy !== null}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-[11px] font-extrabold text-white shadow-plush disabled:opacity-40"
              style={{ background: "var(--accent-grad)" }}
            >
              {sdBusy === "install" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Install Talia's image engine — one tap, zero drivers
            </button>
          )}
          {sdReady && !imageBackend && tab === "image" && (
            <button
              onClick={() => {
                setResult(null);
                void run();
              }}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold"
              style={{ background: "var(--surface-strong)", color: "var(--text-soft)" }}
            >
              <Sparkles size={11} /> Try again with Talia's built-in engine
            </button>
          )}
        </div>
      )}

      {result?.ok && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong mt-3 overflow-hidden rounded-2xl p-2 text-center"
        >
          {result.kind === "image" && (
            <a href={result.dataUrl} download="talia-image.png" title="Click to open / right-click to save">
              <img src={result.dataUrl} alt="Generated" className="mx-auto max-h-72 rounded-xl" />
            </a>
          )}
          {result.kind === "audio" && <audio controls src={result.dataUrl} className="w-full" />}
          {result.kind === "video" && (
            <video controls src={result.dataUrl} className="mx-auto max-h-72 rounded-xl" />
          )}
          <p className="mt-1 text-[10px] font-bold" style={{ color: "var(--text-faint)" }}>
            via {result.backend} · 100% local
          </p>
        </motion.div>
      )}

      <p className="mt-3 text-center text-[11px] leading-relaxed" style={{ color: "var(--text-faint)" }}>
        Images paint with <strong style={{ color: "var(--text-soft)" }}>Talia's own engine</strong> — one tap
        below, no drivers, nothing else to install. Prefer Automatic1111 (<code className="font-mono">:7860</code>)
        or an OpenAI-style server? Set it in advanced controls. Speech needs Piper (<code className="font-mono">TALIA_TTS_URL</code>),
        video needs ComfyUI — all optional, all local.
      </p>
    </Modal>
  );
}
