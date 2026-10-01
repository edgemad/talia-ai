import { motion } from "framer-motion";
import { Mascot } from "./Mascot";

export function StatusPill({
  online,
  netOnline,
  serverReachable = true,
}: {
  online: boolean;
  netOnline: boolean;
  /** Whether Talia's own server answers (independent of the internet). */
  serverReachable?: boolean;
}) {
  const dot = !serverReachable ? "bg-warn" : netOnline ? (online ? "bg-ok" : "bg-warn") : "bg-warn";
  const label = !serverReachable
    ? "Waking Talia's server…"
    : !netOnline
      ? "Internet off — chats & local AI still work"
      : online
        ? "Talia is awake & connected"
        : "Pick a brain — built-in AI needs one tap";

  return (
    <div className="glass-pill inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold" style={{ color: "var(--text-soft)" }}>
      <motion.span
        className={`h-2.5 w-2.5 rounded-full ${dot}`}
        animate={{ scale: [1, 1.35, 1], opacity: [1, 0.7, 1] }}
        transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
      />
      {label}
    </div>
  );
}

export function EmptyState({ theme = "sakura" }: { theme?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="animate-floaty">
        <Mascot size={96} theme={theme} />
      </div>
      <h2 className="text-2xl font-extrabold" style={{ color: "var(--text)" }}>
        Hi, I&apos;m Talia! 🌸
      </h2>
      <p className="max-w-sm text-sm font-medium" style={{ color: "var(--text-soft)" }}>
        Your cozy little local AI companion. Ask me anything — code, ideas, or just
        comfy chit-chat. I live entirely on your machine, so our secrets stay safe~ ♡
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {["Explain closures cutely", "Write me a haiku", "Debug my async code"].map((s) => (
          <motion.span
            key={s}
            whileHover={{ scale: 1.05 }}
            className="glass-pill cursor-default rounded-full px-3.5 py-1.5 text-xs font-semibold text-accent-2"
          >
            {s}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
