import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Plus, Sparkles, Trash2, Wand2, Users } from "lucide-react";
import { Modal } from "./ui";
import { createBot, deleteBot, fetchBots, type BotDef } from "../lib/botsApi";
import { SKILLS } from "../lib/skills";

type Tab = "bots" | "skills";

const QUICK_EMOJI = ["🤖", "🧪", "🎯", "🧭", "🪄", "📚", "🍳", "💪", "🎬", "🧘"];

export function BotsSkillsModal({
  open,
  onClose,
  onSpawnBot,
  onRunSkill,
  skillBusy,
}: {
  open: boolean;
  onClose: () => void;
  /** Start a new chat with this bot as Talia's persona. */
  onSpawnBot: (bot: BotDef) => void;
  /** Run a skill with the given input. */
  onRunSkill: (skillId: string, input: string) => void;
  skillBusy?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("bots");
  const [bots, setBots] = useState<BotDef[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", emoji: "🤖", tagline: "", systemPrompt: "" });
  const [saving, setSaving] = useState(false);
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const [skillInput, setSkillInput] = useState("");

  useEffect(() => {
    if (!open) return;
    void fetchBots().then(setBots);
  }, [open]);

  const saveBot = async () => {
    if (!form.name.trim() || !form.systemPrompt.trim() || saving) return;
    setSaving(true);
    const r = await createBot({
      name: form.name.trim(),
      emoji: form.emoji || "🤖",
      tagline: form.tagline.trim(),
      systemPrompt: form.systemPrompt.trim(),
    });
    setSaving(false);
    if (r.ok && r.bot) {
      setBots((prev) => [...prev.filter((b) => b.id !== r.bot!.id), r.bot!]);
      setForm({ name: "", emoji: "🤖", tagline: "", systemPrompt: "" });
      setShowCreate(false);
    }
  };

  const removeBot = async (id: string) => {
    await deleteBot(id);
    setBots((prev) => prev.filter((b) => b.id !== id));
  };

  const runSkill = () => {
    if (!activeSkill || skillBusy) return;
    onRunSkill(activeSkill, skillInput);
    setSkillInput("");
    setActiveSkill(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Bots & Skills" icon={<span className="text-xl">🤖</span>}>
      <div className="mb-3 flex gap-1.5 rounded-full p-1" style={{ background: "var(--surface)" }}>
        {(
          [
            { id: "bots", label: "Bots", icon: <Users size={14} /> },
            { id: "skills", label: "Skills", icon: <Wand2 size={14} /> },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
              tab === t.id ? "glass-strong" : ""
            }`}
            style={{ color: tab === t.id ? "var(--text)" : "var(--text-faint)" }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "bots" && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold" style={{ color: "var(--text-faint)" }}>
            Pick who you're talking to — each bot has its own brain. Works with any model, free ones included.
          </p>
          {bots.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-3 rounded-2xl border px-3 py-2.5"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <span className="text-2xl">{b.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-extrabold" style={{ color: "var(--text)" }}>
                    {b.name}
                  </span>
                  {b.builtin && (
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-extrabold" style={{ background: "var(--surface-strong)", color: "var(--text-faint)" }}>
                      built-in
                    </span>
                  )}
                </div>
                <div className="truncate text-[11px]" style={{ color: "var(--text-faint)" }}>
                  {b.tagline}
                </div>
              </div>
              {!b.builtin && (
                <button
                  onClick={() => void removeBot(b.id)}
                  className="rounded-full p-1.5 transition hover:bg-rose-500/10"
                  style={{ color: "var(--text-faint)" }}
                  aria-label={`Delete ${b.name}`}
                >
                  <Trash2 size={14} />
                </button>
              )}
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => {
                  onSpawnBot(b);
                  onClose();
                }}
                className="rounded-full px-3 py-1.5 text-xs font-extrabold text-white shadow-plush"
                style={{ background: "var(--accent-grad)" }}
              >
                Chat
              </motion.button>
            </div>
          ))}

          {showCreate ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-dashed p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="flex gap-2">
                <input
                  value={form.emoji}
                  onChange={(e) => setForm({ ...form, emoji: e.target.value.slice(0, 4) })}
                  className="w-14 rounded-xl border px-2 py-2 text-center text-lg outline-none focus:border-accent"
                  style={{ background: "var(--surface-strong)", borderColor: "var(--border)", color: "var(--text)" }}
                  aria-label="Bot emoji"
                />
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Bot name"
                  className="flex-1 rounded-xl border px-3 py-2 text-[13px] outline-none focus:border-accent"
                  style={{ background: "var(--surface-strong)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {QUICK_EMOJI.map((e) => (
                  <button
                    key={e}
                    onClick={() => setForm({ ...form, emoji: e })}
                    className="rounded-lg px-1.5 py-0.5 text-base transition hover:bg-white/50"
                  >
                    {e}
                  </button>
                ))}
              </div>
              <input
                value={form.tagline}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                placeholder="One-line description (optional)"
                className="rounded-xl border px-3 py-2 text-[13px] outline-none focus:border-accent"
                style={{ background: "var(--surface-strong)", borderColor: "var(--border)", color: "var(--text)" }}
              />
              <textarea
                rows={3}
                value={form.systemPrompt}
                onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                placeholder="System prompt — who is this bot? How does it think, talk, and format answers?"
                className="resize-y rounded-xl border px-3 py-2 text-[13px] outline-none focus:border-accent"
                style={{ background: "var(--surface-strong)", borderColor: "var(--border)", color: "var(--text)" }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="glass-pill flex-1 rounded-full px-3 py-2 text-xs font-bold"
                  style={{ color: "var(--text-soft)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void saveBot()}
                  disabled={!form.name.trim() || !form.systemPrompt.trim() || saving}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-extrabold text-white shadow-plush disabled:opacity-40"
                  style={{ background: "var(--accent-grad)" }}
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Save bot
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="glass-pill flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-extrabold transition hover:brightness-105"
              style={{ color: "var(--text-soft)" }}
            >
              <Plus size={14} className="text-accent-2" /> Create your own bot
            </button>
          )}
        </div>
      )}

      {tab === "skills" && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold" style={{ color: "var(--text-faint)" }}>
            One-tap tasks with expert prompts. Skills use the current chat as context when it helps.
          </p>
          {SKILLS.map((s) => (
            <div key={s.id}>
              <button
                onClick={() => {
                  setActiveSkill(activeSkill === s.id ? null : s.id);
                  setSkillInput("");
                }}
                className="flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition hover:brightness-105"
                style={{
                  borderColor: activeSkill === s.id ? "var(--accent)" : "var(--border)",
                  background: "var(--surface)",
                }}
              >
                <span className="text-xl">{s.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-extrabold" style={{ color: "var(--text)" }}>
                    {s.name}
                  </span>
                  <span className="block truncate text-[11px]" style={{ color: "var(--text-faint)" }}>
                    {s.description}
                  </span>
                </span>
                <Sparkles size={14} className="shrink-0 text-accent-2" />
              </button>
              {activeSkill === s.id && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-1.5 flex gap-2 rounded-2xl border border-dashed p-2.5"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <input
                    autoFocus
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runSkill()}
                    placeholder={s.inputHint}
                    className="flex-1 rounded-xl border px-3 py-2 text-[13px] outline-none focus:border-accent"
                    style={{ background: "var(--surface-strong)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                  <button
                    onClick={runSkill}
                    disabled={skillBusy}
                    className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-extrabold text-white shadow-plush disabled:opacity-40"
                    style={{ background: "var(--accent-grad)" }}
                  >
                    {skillBusy ? <Loader2 size={13} className="animate-spin" /> : "Run"}
                  </button>
                </motion.div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
