import { motion } from "framer-motion";
import { Plus, Trash2, Brain, Wand2 } from "lucide-react";
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
}: {
  open: boolean;
  sessions: ChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenMemory: () => void;
  onOpenStudio: () => void;
}) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? 260 : 0, opacity: open ? 1 : 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="flex shrink-0 flex-col overflow-hidden border-r border-blush-100 bg-white/50 backdrop-blur-sm"
    >
      <div className="flex flex-col gap-2 p-3">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onNew}
          className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blush-400 to-lavender-400 px-4 py-2.5 text-sm font-extrabold text-white shadow-plush"
        >
          <Plus size={16} /> New chat
        </motion.button>
        <div className="flex gap-2">
          <button
            onClick={onOpenMemory}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-lavender-200 bg-white px-3 py-1.5 text-xs font-bold text-cocoa-500 transition hover:bg-lavender-50"
          >
            <Brain size={13} /> Memory
          </button>
          <button
            onClick={onOpenStudio}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-blush-200 bg-white px-3 py-1.5 text-xs font-bold text-cocoa-500 transition hover:bg-blush-50"
          >
            <Wand2 size={13} /> Studio
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {sessions.length === 0 && (
          <p className="px-3 py-4 text-xs font-semibold text-cocoa-300">
            No chats yet — say hi! 🌸
          </p>
        )}
        {[...sessions].reverse().map((s) => (
          <motion.div
            key={s.id}
            layout
            className={`group mb-1 flex items-center gap-1 rounded-2xl px-3 py-2 transition ${
              s.id === activeId ? "bg-lavender-100" : "hover:bg-blush-50"
            }`}
          >
            <button onClick={() => onSelect(s.id)} className="min-w-0 flex-1 text-left">
              <div className={`truncate text-[13px] font-bold ${s.id === activeId ? "text-cocoa-700" : "text-cocoa-500"}`}>
                {s.title}
              </div>
              <div className="text-[10px] font-semibold text-cocoa-300">
                {s.messages.filter((m) => m.role !== "system").length} msgs ·{" "}
                {new Date(s.updatedAt).toLocaleDateString()}
              </div>
            </button>
            <button
              onClick={() => onDelete(s.id)}
              className="rounded-full p-1 text-cocoa-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-400 group-hover:opacity-100"
              aria-label={`Delete ${s.title}`}
            >
              <Trash2 size={13} />
            </button>
          </motion.div>
        ))}
      </div>
    </motion.aside>
  );
}
