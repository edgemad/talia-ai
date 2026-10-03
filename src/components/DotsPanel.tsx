import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Loader2, Play, Pause, Plus, Sparkles, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { Modal } from "./ui";
import type { ProviderConfig } from "../types";
import {
  createDot,
  deleteDot,
  fetchDots,
  formatCadence,
  relativeTime,
  runDotNow,
  sendDotFeedback,
  subscribeDotEvents,
  updateDot,
  type Dot,
} from "../lib/dotsApi";

const CADENCE_OPTIONS = [15, 30, 60, 180, 360, 720, 1440];

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  idle: { label: "idle", color: "var(--text-faint)" },
  working: { label: "working…", color: "var(--info)" },
  error: { label: "needs attention", color: "var(--warn)" },
};

export function DotsPanel({
  open,
  onClose,
  provider,
  model,
  onNotice,
}: {
  open: boolean;
  onClose: () => void;
  provider: ProviderConfig;
  model: string;
  onNotice?: (message: string) => void;
}) {
  const [dots, setDots] = useState<Dot[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🔵");
  const [goal, setGoal] = useState("");
  const [instructions, setInstructions] = useState("");
  const [cadence, setCadence] = useState(60);
  const [autonomy, setAutonomy] = useState<"act" | "suggest">("act");

  const refresh = useCallback(async () => {
    setLoading(true);
    setDots(await fetchDots());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // Live updates: a dot that the scheduler wakes while the panel is open shows
  // up immediately, with a toast when it finishes.
  useEffect(() => {
    if (!open) return;
    const unsubscribe = subscribeDotEvents((event) => {
      void refresh();
      if (event.kind === "finished") {
        setBusyId((cur) => (cur === event.dotId ? null : cur));
        onNotice?.(
          event.ok
            ? `🤖 ${event.name ?? "A dot"} finished — ${event.preview ?? "new report ready"}`
            : `🤖 ${event.name ?? "A dot"} hit a snag: ${event.error ?? "unknown error"}`,
        );
      }
    });
    return unsubscribe;
  }, [open, refresh, onNotice]);

  const submit = async () => {
    setError(null);
    if (!goal.trim()) {
      setError("A dot needs a goal.");
      return;
    }
    const r = await createDot({
      name: name.trim() || "New dot",
      emoji: emoji.trim() || "🔵",
      goal: goal.trim(),
      instructions: instructions.trim(),
      cadenceMinutes: cadence,
      autonomy,
      provider,
      model,
    });
    if (!r.ok) {
      setError(r.error ?? "Couldn't create that dot.");
      return;
    }
    setName("");
    setGoal("");
    setInstructions("");
    setShowForm(false);
    await refresh();
  };

  const toggle = async (dot: Dot) => {
    setBusyId(dot.id);
    // Keep the provider/model fresh so an enabled dot can run unattended.
    await updateDot(dot.id, { enabled: !dot.enabled, provider, model });
    setBusyId(null);
    await refresh();
  };

  const runNow = async (dot: Dot) => {
    setBusyId(dot.id);
    const r = await runDotNow(dot.id);
    setBusyId(null);
    if (!r.ok) onNotice?.(r.error ?? "That dot couldn't run.");
    await refresh();
  };

  const changeCadence = async (dot: Dot, minutes: number) => {
    await updateDot(dot.id, { cadenceMinutes: minutes });
    await refresh();
  };

  const rate = async (dot: Dot, rating: "up" | "down") => {
    const note = notes[dot.id] ?? "";
    await sendDotFeedback(dot.id, { rating, note });
    setNotes((n) => ({ ...n, [dot.id]: "" }));
    onNotice?.(rating === "up" ? "Noted — Talia will keep this up 💗" : "Noted — Talia will adjust 🧠");
    await refresh();
  };

  const remove = async (dot: Dot) => {
    await deleteDot(dot.id);
    await refresh();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Dots"
      icon={<span className="text-lg">🔵</span>}
    >
      <p className="mb-3 text-xs font-semibold" style={{ color: "var(--text-soft)" }}>
        Dots are always-on agents. Give one a goal and a cadence, and Talia keeps working on it
        quietly between conversations — researching, reporting back, and learning from your feedback.
      </p>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-bold" style={{ color: "var(--text-faint)" }}>
          {dots.length} {dots.length === 1 ? "dot" : "dots"}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => void refresh()}
            className="glass-pill rounded-full px-3 py-1.5 text-[11px] font-bold transition hover:brightness-105"
            style={{ color: "var(--text-soft)" }}
          >
            Refresh
          </button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-extrabold text-white shadow-plush"
            style={{ background: "var(--accent-grad)" }}
          >
            <Plus size={13} /> New dot
          </motion.button>
        </div>
      </div>

      {showForm && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 rounded-2xl p-3"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div className="flex gap-2">
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="w-14 rounded-xl border px-2 py-2 text-center text-lg outline-none focus:border-accent"
              style={{ background: "var(--surface-strong)", borderColor: "var(--border)", color: "var(--text)" }}
              aria-label="Emoji"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name, e.g. Deal Scout"
              className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:border-accent"
              style={{ background: "var(--surface-strong)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Goal — what should this dot keep working on? e.g. Find current sales on 27-inch monitors under $300"
            rows={3}
            className="mt-2 w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none focus:border-accent"
            style={{ background: "var(--surface-strong)", borderColor: "var(--border)", color: "var(--text)" }}
          />
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Standing instructions (optional) — constraints, tone, sources to trust…"
            rows={2}
            className="mt-2 w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none focus:border-accent"
            style={{ background: "var(--surface-strong)", borderColor: "var(--border)", color: "var(--text)" }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-[11px] font-bold" style={{ color: "var(--text-soft)" }}>
              <Clock size={12} />
              <select
                value={cadence}
                onChange={(e) => setCadence(Number(e.target.value))}
                className="rounded-full border px-2 py-1 text-[11px] outline-none focus:border-accent"
                style={{ background: "var(--surface-strong)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                {CADENCE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {formatCadence(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[11px] font-bold" style={{ color: "var(--text-soft)" }}>
              <Sparkles size={12} />
              <select
                value={autonomy}
                onChange={(e) => setAutonomy(e.target.value as "act" | "suggest")}
                className="rounded-full border px-2 py-1 text-[11px] outline-none focus:border-accent"
                style={{ background: "var(--surface-strong)", borderColor: "var(--border)", color: "var(--text)" }}
              >
                <option value="act">Can research the web</option>
                <option value="suggest">Local knowledge only</option>
              </select>
            </label>
            <button
              onClick={() => void submit()}
              className="ml-auto rounded-full px-3 py-1.5 text-[11px] font-extrabold text-white shadow-plush"
              style={{ background: "var(--accent-grad)" }}
            >
              Create dot
            </button>
          </div>
          {error && (
            <p className="mt-2 text-[11px] font-bold" style={{ color: "var(--warn)" }}>
              {error}
            </p>
          )}
          <p className="mt-2 text-[10px] font-semibold" style={{ color: "var(--text-faint)" }}>
            Uses {model || "no model yet"} · {provider.baseUrl}
          </p>
        </motion.div>
      )}

      <div className="flex flex-col gap-2">
        {loading && dots.length === 0 && (
          <p className="py-6 text-center text-xs font-semibold" style={{ color: "var(--text-faint)" }}>
            Loading your dots…
          </p>
        )}
        {!loading && dots.length === 0 && (
          <p className="py-6 text-center text-xs font-semibold" style={{ color: "var(--text-faint)" }}>
            No dots yet. Create one and Talia will start working on it on her own 🌸
          </p>
        )}

        {dots.map((dot) => {
          const status = STATUS_STYLES[dot.status] ?? STATUS_STYLES.idle;
          const latest = dot.artifacts[dot.artifacts.length - 1];
          const busy = busyId === dot.id || dot.status === "working";
          return (
            <div
              key={dot.id}
              className="rounded-2xl p-3"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-start gap-2">
                <span className="text-xl">{dot.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-extrabold" style={{ color: "var(--text)" }}>
                      {dot.name}
                    </span>
                    <span className="shrink-0 text-[10px] font-bold" style={{ color: status.color }}>
                      {dot.enabled ? status.label : "paused"}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[12px] font-medium" style={{ color: "var(--text-soft)" }}>
                    {dot.goal}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold" style={{ color: "var(--text-faint)" }}>
                    {formatCadence(dot.cadenceMinutes)} · last run {relativeTime(dot.lastRunAt)} · next{" "}
                    {dot.enabled ? relativeTime(dot.nextRunAt) : "paused"} · {dot.runCount} runs
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => void runNow(dot)}
                    disabled={busy}
                    className="rounded-full p-1.5 transition hover:bg-white/30 disabled:opacity-40"
                    style={{ color: "var(--accent-2)" }}
                    title="Run now"
                    aria-label="Run now"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  </button>
                  <button
                    onClick={() => void toggle(dot)}
                    disabled={busyId === dot.id}
                    className="rounded-full p-1.5 transition hover:bg-white/30 disabled:opacity-40"
                    style={{ color: "var(--text-soft)" }}
                    title={dot.enabled ? "Pause" : "Resume"}
                    aria-label={dot.enabled ? "Pause" : "Resume"}
                  >
                    {dot.enabled ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button
                    onClick={() => void remove(dot)}
                    className="rounded-full p-1.5 transition hover:bg-rose-500/10"
                    style={{ color: "var(--text-faint)" }}
                    title="Delete"
                    aria-label="Delete dot"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Cadence + feedback row */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={dot.cadenceMinutes}
                  onChange={(e) => void changeCadence(dot, Number(e.target.value))}
                  className="rounded-full border px-2 py-1 text-[10px] font-bold outline-none focus:border-accent"
                  style={{ background: "var(--surface-strong)", borderColor: "var(--border)", color: "var(--text-soft)" }}
                  aria-label="Cadence"
                >
                  {[...new Set([...CADENCE_OPTIONS, dot.cadenceMinutes])]
                    .sort((a, b) => a - b)
                    .map((m) => (
                      <option key={m} value={m}>
                        {formatCadence(m)}
                      </option>
                    ))}
                </select>
                <input
                  value={notes[dot.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [dot.id]: e.target.value }))}
                  placeholder="Feedback for this dot…"
                  className="min-w-0 flex-1 rounded-full border px-3 py-1 text-[11px] outline-none focus:border-accent"
                  style={{ background: "var(--surface-strong)", borderColor: "var(--border)", color: "var(--text)" }}
                />
                <button
                  onClick={() => void rate(dot, "up")}
                  className="rounded-full p-1.5 transition hover:bg-white/30"
                  style={{ color: "var(--ok)" }}
                  title="Good work — keep it up"
                  aria-label="Thumbs up"
                >
                  <ThumbsUp size={13} />
                </button>
                <button
                  onClick={() => void rate(dot, "down")}
                  className="rounded-full p-1.5 transition hover:bg-white/30"
                  style={{ color: "var(--warn)" }}
                  title="Not quite — adjust"
                  aria-label="Thumbs down"
                >
                  <ThumbsDown size={13} />
                </button>
              </div>

              {latest && (
                <div className="mt-2">
                  <button
                    onClick={() => setExpanded((e) => ({ ...e, [dot.id]: !e[dot.id] }))}
                    className="text-[11px] font-bold text-accent-2 hover:underline"
                  >
                    {expanded[dot.id] ? "▾ Hide latest report" : "▸ Read latest report"}
                  </button>
                  {expanded[dot.id] && (
                    <div
                      className="prose-talia mt-1 max-h-60 overflow-y-auto rounded-xl p-2 text-[12px]"
                      style={{ background: "var(--surface-strong)", border: "1px solid var(--border)" }}
                    >
                      {latest.body}
                      {latest.sources && latest.sources.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {latest.sources.map((s) => (
                            <a
                              key={s.n}
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                              style={{ background: "var(--surface)", color: "var(--text-soft)" }}
                            >
                              [{s.n}] {s.title}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {dot.learnings.length > 0 && (
                <p className="mt-2 text-[10px] font-semibold" style={{ color: "var(--text-faint)" }}>
                  🧠 Learning: {dot.learnings[dot.learnings.length - 1]}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
