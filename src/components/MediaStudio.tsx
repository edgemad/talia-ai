import { useState } from "react";
import { motion } from "framer-motion";
import { Image as ImageIcon, AudioLines, Film, Loader2, SlidersHorizontal } from "lucide-react";
import { Modal } from "./ui";
import { generateImage, generateVideo, speakText, type MediaResult } from "../lib/serverApi";

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
        {busy ? "Creating…" : "Create"}
      </motion.button>

      {result && !result.ok && (
        <p
          className="mt-3 rounded-2xl border p-3 text-xs font-semibold"
          style={{ borderColor: "rgba(251,113,133,0.35)", background: "rgba(251,113,133,0.08)", color: "var(--warn)" }}
        >
          {result.error}
        </p>
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
        Images need Automatic1111/SD on <code className="font-mono">:7860</code> (or an OpenAI-style image
        server), speech needs Piper (<code className="font-mono">TALIA_TTS_URL</code>), video needs ComfyUI —
        all optional, all local. Quality tips: describe lighting & style; raise steps for detail; raise CFG
        to obey the prompt harder.
      </p>
    </Modal>
  );
}
