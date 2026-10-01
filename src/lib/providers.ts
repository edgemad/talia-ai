export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  needsKey: boolean;
  hint: string;
  free: boolean;
  keyUrl?: string;
  emoji: string;
}

/**
 * Ordered for Talia's promise: free & local first, then free cloud tiers,
 * then paid APIs. All are OpenAI-compatible (Claude via its OpenAI shim).
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "builtin",
    name: "Talia Built-in",
    baseUrl: "http://127.0.0.1:11435/v1",
    needsKey: false,
    hint: "Talia's own engine — zero drivers, one tap to install in Settings → Built-in AI.",
    free: true,
    emoji: "🧠",
  },
  {
    id: "ollama",
    name: "Ollama",
    baseUrl: "http://localhost:11434",
    needsKey: false,
    hint: "100% free & offline. Start Ollama, then pull a model from the catalog.",
    free: true,
    emoji: "🦙",
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    needsKey: false,
    hint: "Free local models with a friendly GUI — start its built-in server.",
    free: true,
    emoji: "🖥️",
  },
  {
    id: "jan",
    name: "Jan",
    baseUrl: "http://localhost:1337/v1",
    needsKey: false,
    hint: "Free, open-source local assistant — enable the local API server.",
    free: true,
    emoji: "🫧",
  },
  {
    id: "llamacpp",
    name: "llama.cpp",
    baseUrl: "http://localhost:8080/v1",
    needsKey: false,
    hint: "The reference llama.cpp HTTP server (llama-server).",
    free: true,
    emoji: "⚙️",
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    needsKey: true,
    hint: "Generous free tier, blazing fast tokens.",
    free: true,
    keyUrl: "https://console.groq.com/keys",
    emoji: "⚡",
  },
  {
    id: "openrouter-free",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    hint: "Many models with :free variants at $0.",
    free: true,
    keyUrl: "https://openrouter.ai/settings/keys",
    emoji: "🧭",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    needsKey: true,
    hint: "Free tier via Google AI Studio, huge context.",
    free: true,
    keyUrl: "https://aistudio.google.com/apikey",
    emoji: "✨",
  },
  {
    id: "mistral",
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    needsKey: true,
    hint: "Free experiment tier, excellent European models.",
    free: true,
    keyUrl: "https://console.mistral.ai/api-keys",
    emoji: "🌬️",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    needsKey: true,
    hint: "Pay-as-you-go, the GPT family.",
    free: false,
    keyUrl: "https://platform.openai.com/api-keys",
    emoji: "🌀",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com/v1",
    needsKey: true,
    hint: "Pay-as-you-go, strong reasoning & writing.",
    free: false,
    keyUrl: "https://console.anthropic.com/settings/keys",
    emoji: "🎭",
  },
  {
    id: "custom",
    name: "Custom / other",
    baseUrl: "",
    needsKey: false,
    hint: "Any OpenAI-compatible endpoint (vLLM, LiteLLM, a proxy…).",
    free: false,
    emoji: "🔧",
  },
];

export function presetById(id: string | undefined | null): ProviderPreset | null {
  if (!id) return null;
  return PROVIDER_PRESETS.find((p) => p.id === id) ?? null;
}

/** Guess the preset from a base URL (for migrating old settings). */
export function guessPreset(baseUrl: string): ProviderPreset | null {
  const raw = String(baseUrl || "").replace(/\/+$/, "");
  if (!raw) return null;
  const exact = PROVIDER_PRESETS.find((p) => p.baseUrl.replace(/\/+$/, "") === raw);
  if (exact) return exact;
  if (raw.includes("localhost:11434") || raw.includes("127.0.0.1:11434")) {
    return presetById("ollama");
  }
  if (raw.includes(":11435") || raw.includes("localhost:11435") || raw.includes("127.0.0.1:11435")) {
    return presetById("builtin");
  }
  if (raw.includes("localhost:1234")) return presetById("lmstudio");
  if (raw.includes("localhost:1337")) return presetById("jan");
  if (raw.includes("localhost:8080")) return presetById("llamacpp");
  return null;
}
