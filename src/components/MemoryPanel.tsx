import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Brain, Plus, Trash2 } from "lucide-react";
import { Modal } from "./ui";
import {
  fetchMemory,
  forgetAllMemory,
  forgetMemoryItem,
  recallMemory,
  rememberText,
} from "../lib/serverApi";
import type { MemoryItem } from "../types";

export function MemoryPanel({
  open,
  onClose,
  onUpload,
}: {
  open: boolean;
  onClose: () => void;
  /** Upload the current chat as memories. */
  onUpload?: () => void;
}) {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [newFact, setNewFact] = useState("");


  useEffect(() => {
    if (open) fetchMemory().then(setItems);
  }, [open]);

  const search = async () => {
    if (!query.trim()) return setItems(await fetchMemory());
    const hits = await recallMemory(query, 20);
    setItems(hits.map((h) => ({ ...h, source: `${h.source} · match ${Math.round((h.score ?? 0) * 100)}%` })));
  };

  const add = async () => {
    if (!newFact.trim()) return;
    await rememberText(newFact.trim(), null);
    setNewFact("");
    setItems(await fetchMemory());
  };

  const remove = async (id: string) => {
    await forgetMemoryItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Talia's memory 🧠"
      icon={<Brain size={19} className="text-lavender-400" />}
    >
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search what Talia remembers…"
          className="flex-1 rounded-full border border-blush-200 bg-white px-4 py-2 text-sm outline-none focus:border-lavender-300"
        />
        <button
          onClick={search}
          className="rounded-full border border-lavender-200 bg-white px-4 text-xs font-bold text-cocoa-500 hover:bg-lavender-50"
        >
          Recall
        </button>
      </div>

      <div className="mt-2 flex gap-2">
        <input
          value={newFact}
          onChange={(e) => setNewFact(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Teach Talia something new…"
          className="flex-1 rounded-full border border-blush-200 bg-white px-4 py-2 text-sm outline-none focus:border-lavender-300"
        />
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={add}
          className="rounded-full bg-gradient-to-r from-blush-400 to-lavender-400 px-4 py-2 text-white shadow-plush"
          aria-label="Remember this"
        >
          <Plus size={15} />
        </motion.button>
      </div>

      {onUpload && (
        <button
          onClick={onUpload}
          className="mt-2 w-full rounded-2xl border border-dashed border-lavender-200 bg-lavender-50/50 py-2 text-xs font-bold text-lavender-500 transition hover:bg-lavender-50"
        >
          ⬆️ Upload this conversation to memory
        </button>
      )}

      <div className="mt-3 flex max-h-80 flex-col gap-1.5 overflow-y-auto">
        {items.length === 0 && (
          <p className="py-6 text-center text-xs font-semibold text-cocoa-300">
            Talia's mind is a blank cozy slate 🌸 Chat with her — she'll remember the important bits.
          </p>
        )}
        {items.map((it) => (
          <motion.div
            key={it.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="group flex items-start gap-2 rounded-2xl border border-blush-100 bg-white px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-snug text-cocoa-600">{it.text}</p>
              <p className="mt-0.5 text-[10px] font-bold text-cocoa-300">
                {it.source} · {new Date(it.ts).toLocaleDateString()}
                {it.count && it.count > 1 ? ` · ×${it.count}` : ""}
              </p>
            </div>
            <button
              onClick={() => remove(it.id)}
              className="rounded-full p-1 text-cocoa-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-400 group-hover:opacity-100"
              aria-label="Forget"
            >
              <Trash2 size={13} />
            </button>
          </motion.div>
        ))}
      </div>

      {items.length > 0 && (
        <button
          onClick={async () => {
            if (confirm("Erase everything Talia remembers?")) {
              await forgetAllMemory();
              setItems([]);
            }
          }}
          className="mt-2 text-[11px] font-bold text-rose-400 hover:underline"
        >
          Forget everything…
        </button>
      )}
    </Modal>
  );
}
