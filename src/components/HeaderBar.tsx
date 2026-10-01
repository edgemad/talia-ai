import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Download, Eraser, Globe, Menu, Palette, Settings, Sparkles, Wand2 } from "lucide-react";
import { Mascot } from "./Mascot";
import { StatusPill } from "./StatusPill";

export function HeaderBar({
  online,
  netOnline,
  serverReachable = true,
  model,
  ragActive,
  themeId,
  onToggleSidebar,
  onOpenModels,
  onOpenSettings,
  onOpenStudio,
  onOpenThemes,
  onClear,
  onExport,
  busy,
}: {
  online: boolean;
  netOnline: boolean;
  /** Whether Talia's own server (localhost:8787) answers. */
  serverReachable?: boolean;
  model: string;
  ragActive: boolean;
  themeId: string;
  onToggleSidebar: () => void;
  onOpenModels: () => void;
  onOpenSettings: () => void;
  onOpenStudio: () => void;
  onOpenThemes: () => void;
  onClear: () => void;
  onExport: (format: "json" | "md") => void;
  busy: boolean;
}) {
  return (
    <header className="glass z-20 flex flex-wrap items-center gap-2 px-3 py-3">
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={onToggleSidebar}
        className="glass-pill rounded-full p-2 transition hover:brightness-105"
        title="Toggle chats sidebar"
        aria-label="Toggle sidebar"
      >
        <Menu size={16} style={{ color: "var(--text-soft)" }} />
      </motion.button>

      <div className="flex items-center gap-2.5">
        <Mascot size={38} theme={themeId} />
        <div>
          <h1 className="text-[16px] font-extrabold leading-tight" style={{ color: "var(--text)" }}>
            Talia AI <span className="align-middle text-sm">🌸</span>
          </h1>
          <p className="text-[11px] font-semibold leading-tight" style={{ color: "var(--text-faint)" }}>
            your cozy local companion
          </p>
        </div>
      </div>

      <div className="ml-1 hidden lg:block">
        <StatusPill online={online} netOnline={netOnline} serverReachable={serverReachable} />
      </div>

      {ragActive && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="glass-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold text-info"
          title="Research mode: answers cite the live web"
        >
          <Globe size={12} className="animate-pulse" /> Research
        </motion.span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <motion.button
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.05 }}
          onClick={onOpenModels}
          className="glass-pill inline-flex max-w-[170px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition hover:brightness-105"
          title="Switch model"
        >
          <Sparkles size={13} className="shrink-0 text-accent-2" />
          <span className="truncate" style={{ color: "var(--text)" }}>{model || "pick model"}</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.06, rotate: -3 }}
          onClick={onOpenThemes}
          className="glass-pill rounded-full p-2 transition hover:brightness-105"
          title="Pick a vibe (theme)"
          aria-label="Pick a vibe"
        >
          <Palette size={15} style={{ color: "var(--accent)" }} />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.06, rotate: -3 }}
          onClick={onOpenStudio}
          className="glass-pill rounded-full p-2 transition hover:brightness-105"
          title="Media studio — images, speech & video"
          aria-label="Open studio"
        >
          <Wand2 size={15} style={{ color: "var(--accent-2)" }} />
        </motion.button>

        <PillButton icon={<Download size={14} />} label="Export" title="Export chat">
          {(close) => (
            <>
              <button
                onClick={() => {
                  onExport("md");
                  close();
                }}
                className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold hover:bg-white/40"
                style={{ color: "var(--text)" }}
              >
                📝 Markdown (.md)
              </button>
              <button
                onClick={() => {
                  onExport("json");
                  close();
                }}
                className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold hover:bg-white/40"
                style={{ color: "var(--text)" }}
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
          className="glass-pill rounded-full p-2 transition hover:brightness-105 disabled:opacity-40"
          title="Clear this chat"
          aria-label="Clear chat"
        >
          <Eraser size={15} style={{ color: "var(--text-soft)" }} />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.08, rotate: 12 }}
          onClick={onOpenSettings}
          className="glass-pill rounded-full p-2 transition hover:brightness-105"
          title="Settings"
          aria-label="Settings"
        >
          <Settings size={15} style={{ color: "var(--text-soft)" }} />
        </motion.button>
      </div>
    </header>
  );
}

/** Small glass dropdown pill used for the export menu. */
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
        className="glass-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition hover:brightness-105"
        title={title}
      >
        {icon}
        <span className="hidden md:inline" style={{ color: "var(--text-soft)" }}>{label}</span>
      </motion.button>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 28 }}
          className="glass-strong absolute right-0 z-30 mt-2 w-44 rounded-2xl p-1.5"
        >
          {children(() => setOpen(false))}
        </motion.div>
      )}
    </div>
  );
}
