import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Brain, Wand2, Bot, Gamepad2, Sparkles } from "lucide-react";
import type { ChatSession } from "../types";

// ---------- resizable width (persisted) ---------------------------------------
const SS_KEY = "talia-ai:sidebar-width";
const MIN_W = 208;
const MAX_W = 400;
const DEFAULT_W = 260;

function clampW(w: number): number {
  return Math.min(MAX_W, Math.max(MIN_W, Math.round(w)));
}

function loadWidth(): number {
  try {
    const v = Number(localStorage.getItem(SS_KEY));
    return Number.isFinite(v) && v >= MIN_W ? clampW(v) : DEFAULT_W;
  } catch {
    return DEFAULT_W;
  }
}

// ---------- quick-action pills ---------------------------------------------------
function QuickActions({
  onOpenMemory,
  onOpenBots,
  onOpenStudio,
  onOpenGames,
  onOpenDots,
}: {
  onOpenMemory: () => void;
  onOpenBots: () => void;
  onOpenStudio: () => void;
  onOpenGames: () => void;
  onOpenDots: () => void;
}) {
  // 2-column grid at every width — nothing can ever clip, even on a narrow
  // sidebar. Dots is the flagship so it spans both columns.
  const items = [
    { label: "Dots", icon: <Sparkles size={12} className="text-accent" />, on: onOpenDots, wide: true },
    { label: "Memory", icon: <Brain size={12} className="text-accent-2" />, on: onOpenMemory, wide: false },
    { label: "Bots", icon: <Bot size={12} className="text-accent" />, on: onOpenBots, wide: false },
    { label: "Studio", icon: <Wand2 size={12} className="text-accent" />, on: onOpenStudio, wide: false },
    { label: "Games", icon: <Gamepad2 size={12} className="text-accent-2" />, on: onOpenGames, wide: false },
  ];
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {items.map((it) => (
        <button
          key={it.label}
          onClick={it.on}
          className={`glass-pill flex items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-bold transition hover:brightness-105 ${
            it.wide ? "col-span-2" : ""
          }`}
          style={{ color: "var(--text-soft)" }}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ---------- sidebar ----------------------------------------------------------------
export function SessionSidebar({
  open,
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onOpenMemory,
  onOpenBots,
  onOpenStudio,
  onOpenGames,
  onOpenDots,
}: {
  open: boolean;
  sessions: ChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenMemory: () => void;
  onOpenBots: () => void;
  onOpenStudio: () => void;
  onOpenGames: () => void;
  onOpenDots: () => void;
}) {
  const [width, setWidth] = useState<number>(loadWidth);
  const dragging = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(SS_KEY, String(width));
    } catch {
      /* session-only */
    }
  }, [width]);

  const onDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setWidth(clampW(e.clientX));
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [open]);

  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? width : 0, opacity: open ? 1 : 0 }}
      transition={dragging.current ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
      className="glass-sheen relative shrink-0 overflow-hidden"
      style={{ borderRight: "1px solid var(--border)" }}
    >
      <div className="flex flex-col gap-2 p-3" style={{ width }}>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onNew}
          className="flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-extrabold text-white shadow-plush"
          style={{ background: "var(--accent-grad)" }}
        >
          <Plus size={16} /> New chat
        </motion.button>
        <QuickActions
          onOpenMemory={onOpenMemory}
          onOpenBots={onOpenBots}
          onOpenStudio={onOpenStudio}
          onOpenGames={onOpenGames}
          onOpenDots={onOpenDots}
        />
      </div>

      <div className="overflow-y-auto px-2 pb-3" style={{ width, maxHeight: "calc(100vh - 150px)" }}>
        {sessions.length === 0 && (
          <p className="px-3 py-4 text-xs font-semibold" style={{ color: "var(--text-faint)" }}>
            No chats yet — say hi! 🌸
          </p>
        )}
        {[...sessions].reverse().map((s) => {
          const active = s.id === activeId;
          return (
            <motion.div
              key={s.id}
              layout
              className={`group mb-1 flex items-center gap-1 rounded-2xl px-3 py-2 transition ${
                active ? "glass" : "hover:bg-white/25"
              }`}
            >
              <button onClick={() => onSelect(s.id)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-[13px] font-bold" style={{ color: active ? "var(--text)" : "var(--text-soft)" }}>
                  {s.title}
                </div>
                <div className="text-[10px] font-semibold" style={{ color: "var(--text-faint)" }}>
                  {s.messages.filter((m) => m.role !== "system").length} msgs ·{" "}
                  {new Date(s.updatedAt).toLocaleDateString()}
                </div>
              </button>
              <button
                onClick={() => onDelete(s.id)}
                className="rounded-full p-1 opacity-0 transition hover:bg-rose-500/10 group-hover:opacity-100"
                style={{ color: "var(--text-faint)" }}
                aria-label={`Delete ${s.title}`}
              >
                <Trash2 size={13} />
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* Drag handle — grab the sidebar's right edge to resize */}
      {open && (
        <div
          onMouseDown={onDown}
          className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-accent/30"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize"
        />
      )}
    </motion.aside>
  );
}
