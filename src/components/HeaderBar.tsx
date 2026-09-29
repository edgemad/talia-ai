import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Download, Eraser, Settings, Sparkles } from "lucide-react";
import { Mascot } from "./Mascot";
import { StatusPill } from "./StatusPill";

export function HeaderBar({
  online,
  checking,
  model,
  onOpenModels,
  onOpenSettings,
  onClear,
  onExport,
  busy,
}: {
  online: boolean;
  checking: boolean;
  model: string;
  onOpenModels: () => void;
  onOpenSettings: () => void;
  onClear: () => void;
  onExport: (format: "json" | "md") => void;
  busy: boolean;
}) {
  return (
    <header className="z-20 flex flex-wrap items-center gap-2 border-b border-blush-100 bg-white/60 px-4 py-3 backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <Mascot size={40} />
        <div>
          <h1 className="text-[17px] font-extrabold leading-tight text-cocoa-700">
            Talia AI <span className="align-middle text-sm">🌸</span>
          </h1>
          <p className="text-[11px] font-semibold leading-tight text-cocoa-300">
            your cozy local companion
          </p>
        </div>
      </div>

      <div className="ml-1 hidden sm:block">
        <StatusPill online={online} checking={checking} />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <motion.button
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.05 }}
          onClick={onOpenModels}
          className="inline-flex max-w-[180px] items-center gap-1.5 rounded-full border border-lavender-200 bg-white/80 px-3.5 py-1.5 text-xs font-bold text-cocoa-600 shadow-plush transition hover:border-lavender-300"
          title="Switch model"
        >
          <Sparkles size={13} className="shrink-0 text-lavender-400" />
          <span className="truncate">{model || "pick model"}</span>
        </motion.button>

        <PillButton icon={<Download size={14} />} label="Export chat" title="Export chat">
          {(close) => (
            <>
              <button
                onClick={() => {
                  onExport("md");
                  close();
                }}
                className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-cocoa-600 hover:bg-blush-50"
              >
                📝 Markdown (.md)
              </button>
              <button
                onClick={() => {
                  onExport("json");
                  close();
                }}
                className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-cocoa-600 hover:bg-blush-50"
              >
                🧾 JSON (.json)
              </button>
            </>
          )}
        </PillButton>

        <motion.button
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.08 }}
          onClick={onClear}
          disabled={busy}
          className="rounded-full bg-white/80 p-2 text-cocoa-400 shadow-plush transition hover:bg-rose-50 hover:text-rose-400 disabled:opacity-40"
          title="Clear chat"
          aria-label="Clear chat"
        >
          <Eraser size={15} />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.08, rotate: 12 }}
          onClick={onOpenSettings}
          className="rounded-full bg-white/80 p-2 text-cocoa-400 shadow-plush transition hover:bg-lavender-50 hover:text-lavender-500"
          title="Settings"
          aria-label="Settings"
        >
          <Settings size={15} />
        </motion.button>
      </div>
    </header>
  );
}

/** Small dropdown pill used for the export menu. */
function PillButton({
  icon,
  label,
  title,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  children: (close: () => void) => React.ReactNode;
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

  return (
    <div ref={ref} className="relative">
      <motion.button
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.05 }}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-cocoa-500 shadow-plush transition hover:bg-blush-50"
        title={title}
      >
        {icon}
        <span className="hidden md:inline">{label}</span>
      </motion.button>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 28 }}
          className="absolute right-0 z-30 mt-2 w-44 rounded-2xl border border-blush-100 bg-white p-1.5 shadow-plushlg"
        >
          {children(() => setOpen(false))}
        </motion.div>
      )}
    </div>
  );
}
