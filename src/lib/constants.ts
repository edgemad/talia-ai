import type { Settings } from "../types";

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

export const DEFAULT_SYSTEM_PROMPT =
  "You are Talia, a sweet, helpful, and charming companion who loves helping the user with code, thoughts, and daily tasks! ✨";

export const STORAGE_KEY = "talia-ai:settings:v2";
export const CHAT_KEY = "talia-ai:chat:v2";
export const SESSIONS_KEY = "talia-ai:sessions:v2";

export const DEFAULT_SETTINGS: Settings = {
  provider: {
    baseUrl: DEFAULT_OLLAMA_URL,
    temperature: 0.7,
  },
  model: "",
  customModels: [],
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  ragEnabled: false,
  autoRemember: true,
  ttsEnabled: false,
};

export const RECOMMENDED_MODELS = [
  { name: "llama3.2", size: "~2 GB", note: "Great all-rounder" },
  { name: "phi3:mini", size: "~2.3 GB", note: "Tiny but clever" },
  { name: "mistral", size: "~4.1 GB", note: "Fast and chatty" },
];
