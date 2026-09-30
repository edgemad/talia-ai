import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download, RefreshCw, Sparkles } from "lucide-react";
import { Modal } from "./ui";
import type { DiscoveredModel } from "../lib/api";
import { fetchCatalog, pullModel } from "../lib/serverApi";
import type { CatalogModel } from "../types";

const STARTER_SUGGESTIONS = ["llama3.2:3b", "gemma3:4b", "qwen3:4b", "llama3.1:8b"];

export function ModelPickerModal({
  open,
  onClose,
  models,
  current,
  onSelect,
  onRefresh,
  loading,
  baseUrl,
  onOpenCatalog,
}: {
  open: boolean;
  onClose: () => void;
  models: DiscoveredModel[];
  current: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  loading: boolean;
  /** Provider base URL — pulls need an Ollama-style server. */
  baseUrl: string;
  /** Opens the full catalog modal from the shelf footer. */
  onOpenCatalog?: () => void;
}) {
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pullStatus, setPullStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      onRefresh();
      fetchCatalog().then(setCatalog);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const installed = new Set(models.map((m) => m.id));

  // Ready-to-download shelf: starters first, skip anything already installed,
  // hide fully-installed catalog.
  const suggestions = catalog.filter((m) => !installed.has(m.id));
  const starters = suggestions.filter(
    (m) => STARTER_SUGGESTIONS.includes(m.id) || m.tags.includes("starter"),
  );
  const shelf = (starters.length >= 3 ? starters : suggestions).slice(0, 4);

  const pull = async (m: CatalogModel) => {
    if (busyId) return;
    setBusyId(m.id);
    setPullStatus((s) => ({ ...s, [m.id]: "starting…" }));
    const r = await pullModel(baseUrl, m.id, (msg, pct) => {
      setPullStatus((s) => ({ ...s, [m.id]: pct !== null ? `${msg} ${pct}%` : msg }));
    });
    if (r.ok) {
      setPullStatus((s) => ({ ...s, [m.id]: "ready ✓ — selected!" }));
      onSelect(m.id); // auto-select so the user can just close and chat
      onRefresh();
    } else {
      setPullStatus((s) => ({ ...s, [m.id]: r.error || "download failed" }));
    }
    setBusyId(null);
  };

  const isOllamaStyle = /11434|ollama/i.test(baseUrl) || !baseUrl.includes("/v1");

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
          className="mb-3 rounded-2xl border border-dashed p-4 text-sm"
          style={{ borderColor: "var(--accent)", background: "var(--surface)", color: "var(--text-soft)" }}
        >
          <p className="font-bold" style={{ color: "var(--text)" }}>No models installed yet 🥺</p>
          <p className="mt-1 text-xs leading-relaxed">
            {isOllamaStyle ? (
              <>Download one below with one click, or in a terminal:{" "}
                <code className="ml-1 rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--surface-strong)" }}>
                  ollama pull llama3.2
                </code>
              </>
            ) : (
              <>Start your local server (LM Studio, Jan, llama.cpp…) or load a model in it, then hit refresh.</>
            )}
          </p>
        </div>
      )}

      {/* Installed models */}
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

      {/* Ready to download */}
      {shelf.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "var(--accent-2)" }}>
            ⬇️ Ready to download
          </h3>
          <div className="flex flex-col gap-1.5">
            {shelf.map((m) => {
              const busy = busyId === m.id;
              const done = pullStatus[m.id]?.includes("✓");
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-2xl border px-3 py-2.5"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-extrabold" style={{ color: "var(--text)" }}>
                        {m.name}
                      </span>
                      {m.tags.includes("starter") && (
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-extrabold" style={{ background: "var(--surface-strong)", color: "var(--accent-2)" }}>
                          start here
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px]" style={{ color: "var(--text-faint)" }}>
                      {m.size} · {m.blurb}
                    </div>
                    {pullStatus[m.id] && (
                      <div
                        className="text-[11px] font-bold"
                        style={{ color: done ? "var(--ok)" : "var(--accent-2)" }}
                      >
                        {pullStatus[m.id]}
                      </div>
                    )}
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => pull(m)}
                    disabled={busyId !== null}
                    className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold text-white shadow-plush disabled:opacity-40"
                    style={{ background: "var(--accent-grad)" }}
                  >
                    <Download size={13} />
                    {busy ? "…" : done ? "✓" : "Pull"}
                  </motion.button>
                </div>
              );
            })}
          </div>
          {onOpenCatalog && (
            <button
              onClick={() => {
                onClose();
                onOpenCatalog();
              }}
              className="mt-2 text-[11px] font-bold text-accent-2 hover:underline"
            >
              See all {catalog.length} models →
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
