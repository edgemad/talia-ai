import { useEffect } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Sparkles } from "lucide-react";
import { Modal } from "./ui";
import type { DiscoveredModel } from "../lib/api";

export function ModelPickerModal({
  open,
  onClose,
  models,
  current,
  onSelect,
  onRefresh,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  models: DiscoveredModel[];
  current: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  useEffect(() => {
    if (open) onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose a model"
      icon={<Sparkles size={19} className="text-lavender-400" />}
    >
      <button
        onClick={onRefresh}
        className="glass-pill mb-3 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold transition hover:brightness-105"
        style={{ color: "var(--text-soft)" }}
      >
        <motion.span
          animate={loading ? { rotate: 360 } : { rotate: 0 }}
          transition={loading ? { repeat: Infinity, duration: 0.9, ease: "linear" } : {}}
        >
          <RefreshCw size={13} />
        </motion.span>
        {loading ? "Sniffing out models…" : "Refresh models"}
      </button>

      {models.length === 0 && !loading && (
        <div
          className="rounded-2xl border border-dashed p-4 text-sm"
          style={{ borderColor: "var(--accent)", background: "var(--surface)", color: "var(--text-soft)" }}
        >
          <p className="font-bold" style={{ color: "var(--text)" }}>No models found 🥺</p>
          <p className="mt-1 text-xs leading-relaxed">
            Make sure Ollama is running, then pull a model:
            <code className="ml-1 rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--surface-strong)" }}>ollama pull llama3.2</code>
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {models.map((m, i) => (
          <motion.button
            key={m.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, type: "spring", stiffness: 300, damping: 24 }}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            onClick={() => {
              onSelect(m.id);
              onClose();
            }}
            className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
              m.id === current ? "" : "hover:brightness-105"
            }`}
            style={{
              background: m.id === current ? "var(--surface-strong)" : "var(--surface)",
              borderColor: m.id === current ? "var(--accent)" : "var(--border)",
            }}
          >
            <div>
              <div className="text-sm font-bold" style={{ color: "var(--text)" }}>{m.id}</div>
              {m.id === current && (
                <div className="text-[11px] font-semibold text-accent-2">
                  Currently chatting with this one ♡
                </div>
              )}
            </div>
            {m.id === current && <span className="text-lg">✨</span>}
          </motion.button>
        ))}
      </div>
    </Modal>
  );
}
