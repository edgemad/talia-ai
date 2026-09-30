import { useState } from "react";
import { motion } from "framer-motion";
import { Image as ImageIcon, AudioLines, Film, Loader2 } from "lucide-react";
import { Modal } from "./ui";
import { generateImage, generateVideo, speakText, type MediaResult } from "../lib/serverApi";

type Tab = "image" | "audio" | "video";

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

  const run = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const r =
        tab === "image"
          ? await generateImage({ prompt })
          : tab === "video"
            ? await generateVideo({ prompt, seconds: 3 })
            : await speakText(prompt);
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
            ? "A cozy cottage at dusk, pastel colors, soft light…"
            : tab === "video"
              ? "Cherry blossoms drifting over a calm pond, dreamy…"
              : "Type something for Talia to say out loud…"
        }
        className="w-full resize-none rounded-2xl border p-3 text-sm outline-none focus:border-accent"
        style={{ background: "var(--surface-strong)", borderColor: "var(--border)", color: "var(--text)" }}
      />

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={run}
        disabled={busy || !prompt.trim()}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-extrabold text-white shadow-plush disabled:opacity-40"
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
            <img src={result.dataUrl} alt="Generated" className="mx-auto max-h-72 rounded-xl" />
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
        Images need Automatic1111/SD on <code className="font-mono">:7860</code>, speech needs Piper
        (<code className="font-mono">TALIA_TTS_URL</code>), video needs ComfyUI — all optional, all local. See README.
      </p>
    </Modal>
  );
}
