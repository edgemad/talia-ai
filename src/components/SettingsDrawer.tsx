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
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          checked ? "bg-blush-400" : "bg-cocoa-300/40"
        }`}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow ${checked ? "right-0.5" : "left-0.5"}`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold text-cocoa-600">{label}</span>
        <span className="block text-[11px] leading-snug text-cocoa-300">{hint}</span>
      </span>
    </button>
  );
}

export function SettingsDrawer({
  open,
  onClose,
  settings,
  onChange,
  onOpenCatalog,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (next: Settings) => void;
  onOpenCatalog: () => void;
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
    <Drawer open={open} onClose={onClose} title="Talia's settings" icon={<Mascot size={26} />}>
      <div className="flex flex-col gap-6 text-sm">
        {/* Persona */}
        <section>
          <h3 className="mb-1.5 text-[13px] font-extrabold uppercase tracking-wide text-blush-500">
            🌸 Talia's personality
          </h3>
          <textarea
            rows={4}
            value={settings.systemPrompt}
            onChange={(e) => onChange({ ...settings, systemPrompt: e.target.value })}
            className="w-full resize-y rounded-2xl border border-blush-200 bg-white/90 p-3 text-[13px] leading-relaxed text-cocoa-600 outline-none focus:border-lavender-300"
          />
          <button
            onClick={() => onChange({ ...settings, systemPrompt: DEFAULT_SYSTEM_PROMPT })}
            className="mt-1.5 text-xs font-bold text-lavender-500 underline-offset-2 hover:underline"
          >
            Reset to Talia's default personality
          </button>
        </section>

        {/* Superpowers */}
        <section className="flex flex-col gap-3">
          <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-lavender-500">
            ✨ Superpowers
          </h3>
          <Toggle
            checked={settings.ragEnabled}
            onChange={(v) => onChange({ ...settings, ragEnabled: v })}
            label="🌐 Research mode (Perplexity-style)"
            hint="Searches the live web & cites sources before answering. Slower, smarter."
          />
          <Toggle
            checked={settings.autoRemember}
            onChange={(v) => onChange({ ...settings, autoRemember: v })}
            label="🧠 Remember across chats"
            hint="Talia keeps the important bits in her long-term memory and recalls them in any chat."
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
          <h3 className="mb-1.5 text-[13px] font-extrabold uppercase tracking-wide text-lavender-500">
            🔌 Local provider
          </h3>
          <input
            type="text"
            value={settings.provider.baseUrl}
            onChange={(e) => setProvider({ baseUrl: e.target.value })}
            className="w-full rounded-2xl border border-blush-200 bg-white/90 px-3 py-2 font-mono text-[13px] text-cocoa-600 outline-none focus:border-lavender-300"
          />
          <input
            type="password"
            value={settings.provider.apiKey ?? ""}
            onChange={(e) => setProvider({ apiKey: e.target.value || undefined })}
            className="mt-2 w-full rounded-2xl border border-blush-200 bg-white/90 px-3 py-2 font-mono text-[13px] text-cocoa-600 outline-none focus:border-lavender-300"
            placeholder="API key (optional)"
          />
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onOpenCatalog}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-lavender-400 to-blush-400 py-2.5 text-xs font-extrabold text-white shadow-plush"
          >
            <Sparkles size={14} /> Browse model catalog & one-click pull
          </motion.button>
        </section>

        {/* Generation */}
        <section>
          <h3 className="mb-1.5 text-[13px] font-extrabold uppercase tracking-wide text-blush-400">
            🎚️ Generation
          </h3>
          <label className="flex items-center justify-between text-xs font-semibold text-cocoa-400">
            <span>Temperature</span>
            <span className="font-mono text-cocoa-600">{settings.provider.temperature.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={settings.provider.temperature}
            onChange={(e) => setProvider({ temperature: Number(e.target.value) })}
            className="w-full accent-blush-400"
          />
          <label className="mt-3 flex items-center justify-between text-xs font-semibold text-cocoa-400">
            <span>Max tokens</span>
            <span className="font-mono text-cocoa-600">{settings.provider.maxTokens ?? "auto"}</span>
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
            className="w-full accent-lavender-400"
          />
        </section>

        {/* Custom models */}
        <section>
          <h3 className="mb-1.5 text-[13px] font-extrabold uppercase tracking-wide text-lavender-400">
            🧸 Custom model presets
          </h3>
          {settings.customModels.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1.5">
              {settings.customModels.map((m) => (
                <li key={m.id} className="flex items-center justify-between rounded-2xl border border-lavender-100 bg-white px-3 py-2">
                  <div>
                    <div className="text-[13px] font-bold text-cocoa-600">{m.displayName}</div>
                    <div className="font-mono text-[11px] text-cocoa-400">
                      {m.id} · {m.contextLength} ctx · t°{m.temperature}
                    </div>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() =>
                      onChange({ ...settings, customModels: settings.customModels.filter((x) => x.id !== m.id) })
                    }
                    className="rounded-full p-1.5 text-cocoa-300 transition hover:bg-rose-50 hover:text-rose-400"
                    aria-label={`Remove ${m.displayName}`}
                  >
                    <Trash2 size={15} />
                  </motion.button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-lavender-200 bg-lavender-50/40 p-3">
            <input
              type="text"
              value={cm.id}
              onChange={(e) => setCm({ ...cm, id: e.target.value })}
              placeholder="Model ID (e.g. qwen2.5-coder:7b)"
              className="w-full rounded-xl border border-blush-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-lavender-300"
            />
            <input
              type="text"
              value={cm.displayName}
              onChange={(e) => setCm({ ...cm, displayName: e.target.value })}
              placeholder="Cute display name (optional)"
              className="w-full rounded-xl border border-blush-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-lavender-300"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-bold text-cocoa-400">
                Context length
                <input
                  type="number"
                  min={512}
                  step={512}
                  value={cm.contextLength}
                  onChange={(e) => setCm({ ...cm, contextLength: Number(e.target.value) || 4096 })}
                  className="mt-1 w-full rounded-xl border border-blush-200 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-lavender-300"
                />
              </label>
              <label className="text-[11px] font-bold text-cocoa-400">
                Temperature
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  value={cm.temperature}
                  onChange={(e) => setCm({ ...cm, temperature: Number(e.target.value) })}
                  className="mt-1 w-full rounded-xl border border-blush-200 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-lavender-300"
                />
              </label>
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={addCustomModel}
              disabled={!cm.id.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-blush-400 to-lavender-400 px-4 py-2 text-xs font-extrabold text-white shadow-plush disabled:opacity-40"
            >
              <Plus size={14} /> Save preset
            </motion.button>
          </div>
        </section>
      </div>
    </Drawer>
  );
}
