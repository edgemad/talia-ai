import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

/** Overlay modal with bouncy spring entrance. */
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-cocoa-700/25 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (!panelRef.current?.contains(e.target as Node)) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-[2rem] border border-blush-200 bg-white/95 shadow-plushlg"
            initial={{ scale: 0.85, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
          >
            <div className="flex items-center justify-between px-6 pb-2 pt-5">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-cocoa-700">
                {icon}
                {title}
              </h2>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-cocoa-400 transition hover:rotate-90 hover:bg-blush-100 hover:text-blush-500"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto px-6 pb-4">{children}</div>
            {footer && <div className="px-6 pb-5">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Right-side sliding settings drawer. */
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
          className="fixed inset-0 z-50 bg-cocoa-700/20 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.aside
            className="ml-auto flex h-full w-full max-w-md flex-col border-l border-blush-200 bg-cream-50 shadow-plushlg"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-blush-100 px-5 py-4">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-cocoa-700">
                {icon}
                {title}
              </h2>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-cocoa-400 transition hover:rotate-90 hover:bg-blush-100 hover:text-blush-500"
                aria-label="Close settings"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Soft pastel pill select for choosing models quickly. */
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
        className="flex w-full items-center justify-between gap-2 rounded-full border border-lavender-200 bg-white/80 px-4 py-2 text-left text-sm font-semibold text-cocoa-600 shadow-plush transition hover:border-lavender-300"
      >
        <span className="truncate">{current?.label || "Pick a model…"}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-lavender-400">
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
            className="absolute z-30 mt-2 max-h-60 w-full overflow-y-auto rounded-2xl border border-lavender-100 bg-white p-1.5 shadow-plushlg"
          >
            {options.length === 0 && (
              <li className="px-3 py-2 text-sm text-cocoa-400">No models found 🥺</li>
            )}
            {options.map((o) => (
              <li key={o.value}>
                <button
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                    o.value === value
                      ? "bg-lavender-100 text-cocoa-700"
                      : "text-cocoa-500 hover:bg-blush-50"
                  }`}
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
