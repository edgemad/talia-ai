// 🔄 Always up to date — gentle banner when Talia (or her engine) has a new version.
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { apiUrl } from "../lib/appMode";

interface UpdatesPayload {
  app: { current: string; latest: string | null; updateAvailable: boolean; url: string; assetUrl?: string | null };
  runtime: { current: string | null; latest: string | null; updateAvailable: boolean };
  checkedAt: string;
}

const DISMISS_KEY = "talia-ai:update-dismissed";

export function UpdateBanner() {
  const [updates, setUpdates] = useState<UpdatesPayload | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch(apiUrl("/api/runtime/updates"));
        const j = await r.json();
        if (alive && j?.ok) setUpdates(j as UpdatesPayload);
      } catch {
        /* offline — stay quiet */
      }
    };
    void check();
    const t = setInterval(check, 30 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!updates) return null;
  const key = `${updates.app.latest ?? ""}:${updates.runtime.latest ?? ""}`;
  if (dismissed === key) return null;

  const { app, runtime } = updates;
  if (!app.updateAvailable && !runtime.updateAvailable) return null;

  const dismiss = () => {
    setDismissed(key);
    try {
      localStorage.setItem(DISMISS_KEY, key);
    } catch {
      /* private mode */
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-pill mx-auto mt-2 flex w-fit max-w-[94%] flex-wrap items-center justify-center gap-2 rounded-full px-4 py-1.5"
    >
      <span className="text-[11px] font-bold" style={{ color: "var(--text-soft)" }}>
        {app.updateAvailable ? (
          <>
            🌸 Talia <b>v{app.latest}</b> is out
          </>
        ) : (
          <>
            🧠 Engine <b>{runtime.latest}</b> is available
          </>
        )}
      </span>
      {app.updateAvailable ? (
        <a
          href={app.assetUrl || app.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-full px-2.5 py-1 text-[10.5px] font-extrabold text-white"
          style={{ background: "var(--accent-grad)" }}
        >
          Update
        </a>
      ) : (
        <button
          onClick={() => setDismissed(key)}
          className="rounded-full px-2.5 py-1 text-[10.5px] font-extrabold"
          style={{ background: "var(--surface-strong)", color: "var(--text-soft)" }}
        >
          Update in Settings → Built-in AI
        </button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" className="rounded-full p-0.5" style={{ color: "var(--text-faint)" }}>
        <X size={12} />
      </button>
    </motion.div>
  );
}
