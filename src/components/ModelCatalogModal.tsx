import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download, Sparkles } from "lucide-react";
import { Modal } from "./ui";
import { fetchCatalog, pullModel } from "../lib/serverApi";
import type { CatalogModel } from "../types";

export function ModelCatalogModal({
  open,
  onClose,
  baseUrl,
  onPulled,
}: {
  open: boolean;
  onClose: () => void;
  baseUrl: string;
  onPulled: () => void;
}) {
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) fetchCatalog().then(setCatalog);
  }, [open]);

  const pull = async (m: CatalogModel) => {
    setBusyId(m.id);
    setStatus((s) => ({ ...s, [m.id]: "starting…" }));
    const r = await pullModel(baseUrl, m.id, (msg, pct) => {
      setStatus((s) => ({ ...s, [m.id]: pct !== null ? `${msg} ${pct}%` : msg }));
    });
    if (r.ok) {
      setStatus((s) => ({ ...s, [m.id]: "ready ✓ — pick it from the dropdown" }));
      onPulled();
    } else {
      setStatus((s) => ({ ...s, [m.id]: r.error || "failed" }));
    }
    setBusyId(null);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Model catalog"
      icon={<Sparkles size={19} className="text-lavender-400" />}
      footer={
        <p className="pb-1 text-center text-[11px] leading-relaxed text-cocoa-300">
          Pulls stream live progress from Ollama. Uncensored models (Dolphin) don't refuse
          legal-but-edgy requests — you're the adult in the room. 🐬
        </p>
      }
    >
      <div className="flex flex-col gap-2.5">
        {catalog.map((m, i) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl border border-blush-100 bg-white p-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm font-extrabold text-cocoa-700">{m.name}</h3>
                  {m.tags.map((t) => (
                    <span
                      key={t}
                      className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${
                        t === "uncensored"
                          ? "bg-rose-100 text-rose-500"
                          : t === "vision" || t === "images-in"
                            ? "bg-lavender-100 text-lavender-500"
                            : "bg-blush-100 text-blush-500"
                      }`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-xs leading-snug text-cocoa-500">{m.blurb}</p>
                <p className="mt-1 font-mono text-[10px] text-cocoa-300">
                  {m.id} · {m.size}
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => pull(m)}
                disabled={busyId !== null}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-blush-400 to-lavender-400 px-3.5 py-2 text-xs font-extrabold text-white shadow-plush disabled:opacity-40"
              >
                <Download size={13} />
                {busyId === m.id ? "…" : "Pull"}
              </motion.button>
            </div>
            {status[m.id] && (
              <p
                className={`mt-2 text-[11px] font-bold ${
                  status[m.id].includes("✓") ? "text-emerald-500" : "text-lavender-500"
                }`}
              >
                {status[m.id]}
              </p>
            )}
          </motion.div>
        ))}
      </div>
    </Modal>
  );
}
