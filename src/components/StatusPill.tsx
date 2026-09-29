import { motion } from "framer-motion";
import { Mascot } from "./Mascot";

export function StatusPill({
  online,
  checking,
}: {
  online: boolean;
  checking: boolean;
}) {
  if (checking) {
    return (
      <motion.div
        className="inline-flex items-center gap-2 rounded-full border border-lavender-200 bg-white/80 px-3.5 py-1.5 text-xs font-bold text-cocoa-500 shadow-plush"
        animate={{ opacity: [1, 0.7, 1] }}
        transition={{ repeat: Infinity, duration: 1.4 }}
      >
        <span className="h-2 w-2 rounded-full bg-lavender-300" />
        Waking up…
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold shadow-plush ${
        online
          ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border border-rose-200 bg-rose-50 text-rose-600"
      }`}
    >
      <motion.span
        className={`h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-400" : "bg-rose-400"}`}
        animate={{ scale: [1, 1.35, 1], opacity: [1, 0.7, 1] }}
        transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
      />
      {online ? "Talia is awake & connected" : "Ollama offline — check localhost"}
    </motion.div>
  );
}

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="animate-floaty">
        <Mascot size={96} />
      </div>
      <h2 className="text-2xl font-extrabold text-cocoa-700">
        Hi, I&apos;m Talia! 🌸
      </h2>
      <p className="max-w-sm text-sm font-medium text-cocoa-400">
        Your cozy little local AI companion. Ask me anything — code, ideas, or just
        comfy chit-chat. I live entirely on your machine, so our secrets stay safe~ ♡
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {["Explain closures cutely", "Write me a haiku", "Debug my async code"].map(
          (s) => (
            <motion.span
              key={s}
              whileHover={{ scale: 1.05 }}
              className="cursor-default rounded-full border border-lavender-200 bg-white/70 px-3.5 py-1.5 text-xs font-semibold text-lavender-500"
            >
              {s}
            </motion.span>
          ),
        )}
      </div>
    </div>
  );
}
