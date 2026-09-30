import { motion } from "framer-motion";
import { Modal } from "./ui";
import { THEMES } from "../lib/themes";

export function ThemePicker({
  open,
  onClose,
  current,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  current: string;
  onPick: (id: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Pick a vibe" icon={<span className="text-lg">🎨</span>}>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {THEMES.map((t, i) => {
          const active = t.id === current;
          return (
            <motion.button
              key={t.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, type: "spring", stiffness: 320, damping: 24 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onPick(t.id)}
              className={`glass-sheen relative overflow-hidden rounded-3xl border p-3.5 text-left transition ${
                active ? "ring-2 ring-accent" : ""
              }`}
              style={{
                background: t.swatch[2] + "22",
                borderColor: active ? "var(--accent)" : "var(--border)",
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{t.emoji}</span>
                <span className="text-sm font-extrabold" style={{ color: "var(--text)" }}>
                  {t.name}
                  {active && <span className="ml-1.5 text-[10px] font-bold text-accent">· wearing this ♡</span>}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--text-soft)" }}>
                {t.blurb}
              </p>
              <div className="mt-2.5 flex gap-1.5">
                {t.swatch.map((c, j) => (
                  <motion.span
                    key={j}
                    whileHover={{ scale: 1.25, rotate: 8 }}
                    className="h-5 w-5 rounded-full border border-white/60 shadow"
                    style={{ background: c }}
                  />
                ))}
              </div>
              {t.id === "dragon" && (
                <img src="/dragon.svg" alt="" className="absolute -bottom-2 -right-1 w-12 opacity-90" />
              )}
            </motion.button>
          );
        })}
      </div>
      <p className="mt-3 text-center text-[11px] font-semibold" style={{ color: "var(--text-faint)" }}>
        Themes swap the mascot too — the Dragon Lagoon brings a soaring baby dragon 🐉☁️
      </p>
    </Modal>
  );
}
