import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Globe, Send, Square } from "lucide-react";

export function Composer({
  onSend,
  onStop,
  busy,
  researchEnabled,
  onToggleResearch,
  placeholder,
}: {
  /** Return false to keep the typed text (e.g. no model selected yet). */
  onSend: (text: string) => boolean | void | Promise<boolean | void>;
  onStop: () => void;
  busy: boolean;
  researchEnabled: boolean;
  onToggleResearch: () => void;
  /** Overrides the default placeholder, e.g. while a game is live. */
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [burst, setBurst] = useState(0);

  const submit = async () => {
    const text = inputRef.current?.value.trim();
    if (!text || busy) return;
    setBurst((b) => b + 1);
    const accepted = await onSend(text);
    if (accepted !== false && inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="px-3 pb-4 pt-1">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <motion.div
          className="glass-sheen flex flex-1 items-end rounded-3xl p-2"
          whileHover={{ scale: 1.005 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            placeholder={placeholder ?? "Say hi to Talia… 🌸"}
            className="max-h-40 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] outline-none"
            style={{ color: "var(--text)" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={onToggleResearch}
            className={`m-1 flex h-8 w-8 items-center justify-center rounded-full transition ${
              researchEnabled ? "bg-info/20 text-info ring-2 ring-info/40" : "hover:bg-white/40"
            }`}
            style={researchEnabled ? {} : { color: "var(--text-faint)" }}
            title={researchEnabled ? "Research mode ON — answers cite the live web" : "Enable research mode for this answer"}
            aria-label="Toggle research mode"
          >
            <Globe size={15} />
          </motion.button>
        </motion.div>

        {busy ? (
          <motion.button
            onClick={onStop}
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
            className="glass-strong flex h-12 w-12 items-center justify-center rounded-full"
            aria-label="Stop generating"
            title="Stop generating"
          >
            <Square size={17} fill="currentColor" style={{ color: "var(--warn)" }} />
          </motion.button>
        ) : (
          <motion.button
            onClick={submit}
            whileTap={{ scale: 0.85 }}
            whileHover={{ scale: 1.08, rotate: -4 }}
            className="relative flex h-12 w-12 items-center justify-center rounded-full text-white shadow-plush"
            style={{ background: "var(--accent-grad)" }}
            aria-label="Send message"
            title="Send"
          >
            <Send size={18} />
            {/* Spark ring on every send ✨ */}
            {burst > 0 && (
              <motion.span
                key={burst}
                initial={{ scale: 0.6, opacity: 0.85 }}
                animate={{ scale: 1.9, opacity: 0 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{ border: "2.5px solid var(--accent)" }}
              />
            )}
          </motion.button>
        )}
      </div>
      <p className="mt-2 text-center text-[11px]" style={{ color: "var(--text-faint)" }}>
        Talia runs fully on your machine 💗 — press Enter to send, Shift+Enter for a new line
        {researchEnabled ? " · 🌐 research mode: answers will cite the live web" : ""}
      </p>
    </div>
  );
}
