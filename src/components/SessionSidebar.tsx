import { motion } from "framer-motion";
import { Plus, Trash2, Brain, Wand2, Bot } from "lucide-react";
import type { ChatSession } from "../types";

export function SessionSidebar({
  open,
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onOpenMemory,
  onOpenStudio,
  onOpenBots,
}: {
  open: boolean;
  sessions: ChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenMemory: () => void;
  onOpenStudio: () => void;
  onOpenBots: () => void;
}) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? 260 : 0, opacity: open ? 1 : 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="glass-sheen shrink-0 overflow-hidden"
      style={{ borderRight: "1px solid var(--border)" }}
    >
      <div className="flex w-[260px] flex-col gap-2 p-3">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onNew}
          className="flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-extrabold text-white shadow-plush"
          style={{ background: "var(--accent-grad)" }}
        >
          <Plus size={16} /> New chat
        </motion.button>
        <div className="flex gap-1.5">
          <button
            onClick={onOpenMemory}
            className="glass-pill flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-bold transition hover:brightness-105"
            style={{ color: "var(--text-soft)" }}
          >
            <Brain size={12} className="text-accent-2" /> Memory
          </button>
          <button
            onClick={onOpenBots}
            className="glass-pill flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-bold transition hover:brightness-105"
            style={{ color: "var(--text-soft)" }}
          >
            <Bot size={12} className="text-accent" /> Bots
          </button>
          <button
            onClick={onOpenStudio}
            className="glass-pill flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-bold transition hover:brightness-105"
            style={{ color: "var(--text-soft)" }}
          >
            <Wand2 size={12} className="text-accent" /> Studio
          </button>
        </div>
      </div>

      <div className="w-[260px] overflow-y-auto px-2 pb-3" style={{ maxHeight: "calc(100vh - 130px)" }}>
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
    </motion.aside>
  );
}
