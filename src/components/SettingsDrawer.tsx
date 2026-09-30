import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { Drawer } from "./ui";
import { Mascot } from "./Mascot";
import { DEFAULT_SYSTEM_PROMPT } from "../lib/constants";
import type { CustomModelPreset, Settings } from "../types";

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <button onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 text-left">
      <span
        className="relative h-5 w-9 shrink-0 rounded-full transition"
        style={{ background: checked ? "var(--accent)" : "var(--border)" }}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow ${checked ? "right-0.5" : "left-0.5"}`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold" style={{ color: "var(--text)" }}>
          {label}
        </span>
        <span className="block text-[11px] leading-snug" style={{ color: "var(--text-faint)" }}>
          {hint}
        </span>
      </span>
    </button>
  );
}

const inputStyle = {
  background: "var(--surface)",
  borderColor: "var(--border)",
  color: "var(--text)",
} as const;

function SectionTitle({ children, color = "var(--accent)" }: { children: React.ReactNode; color?: string }) {
  return (
    <h3 className="mb-1.5 text-[13px] font-extrabold uppercase tracking-wide" style={{ color }}>
      {children}
    </h3>
  );
}

export function SettingsDrawer({
  open,
  onClose,
  settings,
  onChange,
  onOpenCatalog,
  onOpenThemes,
  themeId,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (next: Settings) => void;
  onOpenCatalog: () => void;
  onOpenThemes: () => void;
  themeId: string;
}) {
  const [cm, setCm] = useState<CustomModelPreset>({
    id: "",
    displayName: "",
    contextLength: 4096,
    temperature: 0.7,
  });

  const setProvider = (patch: Partial<Settings["provider"]>) =>
    onChange({ ...settings, provider: { ...settings.provider, ...patch } });

  const addCustomModel = () => {
    const id = cm.id.trim();
    if (!id) return;
    const next: CustomModelPreset = { ...cm, id, displayName: cm.displayName.trim() || id };
    if (!settings.customModels.some((m) => m.id === id)) {
      onChange({ ...settings, customModels: [...settings.customModels, next] });
    }
    setCm({ id: "", displayName: "", contextLength: 4096, temperature: 0.7 });
  };

  return (
    <Drawer open={open} onClose={onClose} title="Talia's settings" icon={<Mascot size={26} theme={themeId} />}>
      <div className="flex flex-col gap-6 text-sm">
        {/* Look & feel */}
        <section>
          <SectionTitle>🎨 Look & feel</SectionTitle>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={onOpenThemes}
            className="glass-sheen flex w-full items-center justify-between rounded-2xl border p-3 transition hover:brightness-105"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <span className="text-left">
              <span className="block text-[13px] font-bold" style={{ color: "var(--text)" }}>
                Liquid glass themes
              </span>
              <span className="block text-[11px]" style={{ color: "var(--text-faint)" }}>
                Sakura · Ocean · Dino Lagoon 🦕 · Matcha · Midnight
              </span>
            </span>
            <span className="text-lg">🎨</span>
          </motion.button>
        </section>

        {/* Persona */}
        <section>
          <SectionTitle>🌸 Talia's personality</SectionTitle>
          <textarea
            rows={4}
            value={settings.systemPrompt}
            onChange={(e) => onChange({ ...settings, systemPrompt: e.target.value })}
            className="w-full resize-y rounded-2xl border p-3 text-[13px] leading-relaxed outline-none focus:border-accent"
            style={inputStyle}
          />
          <button
            onClick={() => onChange({ ...settings, systemPrompt: DEFAULT_SYSTEM_PROMPT })}
            className="mt-1.5 text-xs font-bold text-accent-2 underline-offset-2 hover:underline"
          >
            Reset to Talia's default personality
          </button>
        </section>

        {/* Superpowers */}
        <section className="flex flex-col gap-3">
          <SectionTitle color="var(--accent-2)">✨ Superpowers</SectionTitle>
          <Toggle
            checked={settings.ragEnabled}
            onChange={(v) => onChange({ ...settings, ragEnabled: v })}
            label="🌐 Research mode (Perplexity-style)"
            hint="Searches the live web & cites sources. Needs internet — Talia skips it gracefully offline."
          />
          <Toggle
            checked={settings.autoRemember}
            onChange={(v) => onChange({ ...settings, autoRemember: v })}
            label="🧠 Remember across chats"
            hint="Keeps the important bits in local memory and recalls them in any chat. Works fully offline."
          />
          <Toggle
            checked={settings.ttsEnabled}
            onChange={(v) => onChange({ ...settings, ttsEnabled: v })}
            label="🔊 Speak replies aloud"
            hint="Reads answers with your local TTS voice (Piper or compatible)."
          />
        </section>

        {/* Provider */}
        <section>
          <SectionTitle color="var(--accent-2)">🔌 Local provider</SectionTitle>
          <input
            type="text"
            value={settings.provider.baseUrl}
            onChange={(e) => setProvider({ baseUrl: e.target.value })}
            className="w-full rounded-2xl border px-3 py-2 font-mono text-[13px] outline-none focus:border-accent"
            style={inputStyle}
          />
          <input
            type="password"
            value={settings.provider.apiKey ?? ""}
            onChange={(e) => setProvider({ apiKey: e.target.value || undefined })}
            className="mt-2 w-full rounded-2xl border px-3 py-2 font-mono text-[13px] outline-none focus:border-accent"
            style={inputStyle}
            placeholder="API key (optional)"
          />
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onOpenCatalog}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-xs font-extrabold text-white shadow-plush"
            style={{ background: "var(--accent-grad)" }}
          >
            <Sparkles size={14} /> Browse model catalog & one-click pull
          </motion.button>
          <p className="mt-2 text-[11px] leading-snug" style={{ color: "var(--text-faint)" }}>
            Pulling models needs internet; chatting works offline once they're downloaded.
          </p>
        </section>

        {/* Generation */}
        <section>
          <SectionTitle color="var(--accent)">🎚️ Generation</SectionTitle>
          <label className="flex items-center justify-between text-xs font-semibold" style={{ color: "var(--text-soft)" }}>
            <span>Temperature</span>
            <span className="font-mono">{settings.provider.temperature.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={settings.provider.temperature}
            onChange={(e) => setProvider({ temperature: Number(e.target.value) })}
            className="w-full accent-accent"
          />
          <label className="mt-3 flex items-center justify-between text-xs font-semibold" style={{ color: "var(--text-soft)" }}>
            <span>Max tokens</span>
            <span className="font-mono">{settings.provider.maxTokens ?? "auto"}</span>
          </label>
          <input
            type="range"
            min={0}
            max={8192}
            step={128}
            value={settings.provider.maxTokens ?? 0}
            onChange={(e) =>
              setProvider({ maxTokens: Number(e.target.value) === 0 ? undefined : Number(e.target.value) })
            }
            className="w-full accent-accent-2"
          />
        </section>

        {/* Custom models */}
        <section>
          <SectionTitle color="var(--accent-2)">🧸 Custom model presets</SectionTitle>
          {settings.customModels.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1.5">
              {settings.customModels.map((m) => (
                <li key={m.id} className="flex items-center justify-between rounded-2xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <div>
                    <div className="text-[13px] font-bold" style={{ color: "var(--text)" }}>{m.displayName}</div>
                    <div className="font-mono text-[11px]" style={{ color: "var(--text-faint)" }}>
                      {m.id} · {m.contextLength} ctx · t°{m.temperature}
                    </div>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() =>
                      onChange({ ...settings, customModels: settings.customModels.filter((x) => x.id !== m.id) })
                    }
                    className="rounded-full p-1.5 transition hover:bg-rose-500/10"
                    style={{ color: "var(--text-faint)" }}
                    aria-label={`Remove ${m.displayName}`}
                  >
                    <Trash2 size={15} />
                  </motion.button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2 rounded-2xl border border-dashed p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <input
              type="text"
              value={cm.id}
              onChange={(e) => setCm({ ...cm, id: e.target.value })}
              placeholder="Model ID (e.g. qwen2.5-coder:7b)"
              className="w-full rounded-xl border px-3 py-2 text-[13px] outline-none focus:border-accent"
              style={inputStyle}
            />
            <input
              type="text"
              value={cm.displayName}
              onChange={(e) => setCm({ ...cm, displayName: e.target.value })}
              placeholder="Cute display name (optional)"
              className="w-full rounded-xl border px-3 py-2 text-[13px] outline-none focus:border-accent"
              style={inputStyle}
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-bold" style={{ color: "var(--text-soft)" }}>
                Context length
                <input
                  type="number"
                  min={512}
                  step={512}
                  value={cm.contextLength}
                  onChange={(e) => setCm({ ...cm, contextLength: Number(e.target.value) || 4096 })}
                  className="mt-1 w-full rounded-xl border px-2 py-1.5 text-[13px] outline-none focus:border-accent"
                  style={inputStyle}
                />
              </label>
              <label className="text-[11px] font-bold" style={{ color: "var(--text-soft)" }}>
                Temperature
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  value={cm.temperature}
                  onChange={(e) => setCm({ ...cm, temperature: Number(e.target.value) })}
                  className="mt-1 w-full rounded-xl border px-2 py-1.5 text-[13px] outline-none focus:border-accent"
                  style={inputStyle}
                />
              </label>
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={addCustomModel}
              disabled={!cm.id.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-extrabold text-white shadow-plush disabled:opacity-40"
              style={{ background: "var(--accent-grad)" }}
            >
              <Plus size={14} /> Save preset
            </motion.button>
          </div>
        </section>
      </div>
    </Drawer>
  );
}
