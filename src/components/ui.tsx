import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

/** Overlay modal with bouncy spring entrance and liquid-glass panel. */
export function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const panelRef = useRef<HTMLDivElement>(null);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(20,16,28,0.28)", backdropFilter: "blur(6px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (!panelRef.current?.contains(e.target as Node)) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            className="glass-strong flex max-h-[85vh] w-full max-w-lg flex-col rounded-[2rem]"
            initial={{ scale: 0.85, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
          >
            <div className="flex items-center justify-between px-6 pb-2 pt-5">
              <h2 className="flex items-center gap-2 text-lg font-extrabold" style={{ color: "var(--text)" }}>
                {icon}
                {title}
              </h2>
              <button
                onClick={onClose}
                className="rounded-full p-2 transition hover:rotate-90 hover:bg-white/40"
                style={{ color: "var(--text-faint)" }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto px-6 pb-4" style={{ color: "var(--text)" }}>{children}</div>
            {footer && <div className="px-6 pb-5">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Right-side sliding settings drawer with liquid glass. */
export function Drawer({
  open,
  onClose,
  title,
  icon,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50"
          style={{ background: "rgba(20,16,28,0.2)", backdropFilter: "blur(4px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.aside
            className="glass-strong ml-auto flex h-full w-full max-w-md flex-col"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <h2 className="flex items-center gap-2 text-lg font-extrabold" style={{ color: "var(--text)" }}>
                {icon}
                {title}
              </h2>
              <button
                onClick={onClose}
                className="rounded-full p-2 transition hover:rotate-90 hover:bg-white/40"
                style={{ color: "var(--text-faint)" }}
                aria-label="Close settings"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5" style={{ color: "var(--text)" }}>{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Soft glass pill select for choosing models quickly. */
export function PillSelect({
  value,
  onChange,
  options,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => setOpen((o) => !o)}
        className="glass-pill flex w-full items-center justify-between gap-2 rounded-full px-4 py-2 text-left text-sm font-semibold transition hover:brightness-105"
        style={{ color: "var(--text)" }}
      >
        <span className="truncate">{current?.label || "Pick a model…"}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-accent-2">
          ▾
        </motion.span>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="glass-strong absolute z-30 mt-2 max-h-60 w-full overflow-y-auto rounded-2xl p-1.5"
          >
            {options.length === 0 && (
              <li className="px-3 py-2 text-sm" style={{ color: "var(--text-faint)" }}>
                No models found 🥺
              </li>
            )}
            {options.map((o) => (
              <li key={o.value}>
                <button
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                    o.value === value ? "bg-white/60" : "hover:bg-white/30"
                  }`}
                  style={{ color: "var(--text-soft)" }}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
