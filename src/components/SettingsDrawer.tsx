import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import { Drawer } from "./ui";
import { Mascot } from "./Mascot";
import { DEFAULT_SYSTEM_PROMPT } from "../lib/constants";
import type { CustomModelPreset, Settings } from "../types";

export function SettingsDrawer({
  open,
  onClose,
  settings,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (next: Settings) => void;
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
    const next: CustomModelPreset = {
      ...cm,
      id,
      displayName: cm.displayName.trim() || id,
    };
    if (!settings.customModels.some((m) => m.id === id)) {
      onChange({ ...settings, customModels: [...settings.customModels, next] });
    }
    setCm({ id: "", displayName: "", contextLength: 4096, temperature: 0.7 });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Talia's settings"
      icon={<Mascot size={26} />}
    >
      <div className="flex flex-col gap-6 text-sm">
        {/* Persona */}
        <section>
          <h3 className="mb-1.5 flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide text-blush-500">
            🌸 Talia&apos;s personality
          </h3>
          <label className="mb-1 block text-xs font-semibold text-cocoa-400">
            System prompt (who Talia is)
          </label>
          <textarea
            rows={4}
            value={settings.systemPrompt}
            onChange={(e) => onChange({ ...settings, systemPrompt: e.target.value })}
            className="w-full resize-y rounded-2xl border border-blush-200 bg-white/90 p-3 text-[13px] leading-relaxed text-cocoa-600 outline-none transition focus:border-lavender-300"
          />
          <button
            onClick={() => onChange({ ...settings, systemPrompt: DEFAULT_SYSTEM_PROMPT })}
            className="mt-1.5 text-xs font-bold text-lavender-500 underline-offset-2 hover:underline"
          >
            Reset to Talia&apos;s default personality
          </button>
        </section>

        {/* Provider */}
        <section>
          <h3 className="mb-1.5 text-[13px] font-extrabold uppercase tracking-wide text-lavender-500">
            🔌 Local provider
          </h3>
          <label className="mb-1 block text-xs font-semibold text-cocoa-400">
            Base URL (Ollama, LM Studio, llama.cpp…)
          </label>
          <input
            type="text"
            value={settings.provider.baseUrl}
            onChange={(e) => setProvider({ baseUrl: e.target.value })}
            className="w-full rounded-2xl border border-blush-200 bg-white/90 px-3 py-2 font-mono text-[13px] text-cocoa-600 outline-none focus:border-lavender-300"
          />
          <label className="mb-1 mt-3 block text-xs font-semibold text-cocoa-400">
            API key <span className="font-normal">(optional — for gated local servers)</span>
          </label>
          <input
            type="password"
            value={settings.provider.apiKey ?? ""}
            onChange={(e) => setProvider({ apiKey: e.target.value || undefined })}
            className="w-full rounded-2xl border border-blush-200 bg-white/90 px-3 py-2 font-mono text-[13px] text-cocoa-600 outline-none focus:border-lavender-300"
            placeholder="leave empty for Ollama"
          />
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
          <p className="mb-2 text-xs text-cocoa-400">
            Saved presets appear in the model dropdown, even before Talia discovers them.
          </p>

          {settings.customModels.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1.5">
              {settings.customModels.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded-2xl border border-lavender-100 bg-white px-3 py-2"
                >
                  <div>
                    <div className="text-[13px] font-bold text-cocoa-600">{m.displayName}</div>
                    <div className="font-mono text-[11px] text-cocoa-400">
                      {m.id} · {m.contextLength} ctx · t°{m.temperature}
                    </div>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() =>
                      onChange({
                        ...settings,
                        customModels: settings.customModels.filter((x) => x.id !== m.id),
                      })
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
