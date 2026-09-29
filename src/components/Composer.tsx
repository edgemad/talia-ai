import { useRef } from "react";
import { motion } from "framer-motion";
import { Send, Square } from "lucide-react";

export function Composer({
  onSend,
  onStop,
  busy,
}: {
  /** Return false to keep the typed text (e.g. no model selected yet). */
  onSend: (text: string) => boolean | void | Promise<boolean | void>;
  onStop: () => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    const text = inputRef.current?.value.trim();
    if (!text || busy) return;
    const accepted = await onSend(text);
    if (accepted !== false && inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="px-3 pb-4 pt-1">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <motion.div
          className="flex flex-1 items-end rounded-3xl border border-blush-200 bg-white/90 p-2 shadow-plush backdrop-blur"
          whileHover={{ scale: 1.005 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            placeholder="Say hi to Talia… 🌸"
            className="max-h-40 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] text-cocoa-700 outline-none placeholder:text-cocoa-300"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </motion.div>

        {busy ? (
          <motion.button
            onClick={onStop}
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-cocoa-500 text-white shadow-plush"
            aria-label="Stop generating"
            title="Stop generating"
          >
            <Square size={17} fill="currentColor" />
          </motion.button>
        ) : (
          <motion.button
            onClick={submit}
            whileTap={{ scale: 0.85 }}
            whileHover={{ scale: 1.08, rotate: -4 }}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blush-400 to-lavender-400 text-white shadow-plush"
            aria-label="Send message"
            title="Send"
          >
            <Send size={18} />
          </motion.button>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-cocoa-300">
        Talia runs fully on your machine 💗 — press Enter to send, Shift+Enter for a new line
      </p>
    </div>
  );
}
