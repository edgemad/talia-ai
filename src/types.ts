export interface ProviderConfig {
  baseUrl: string;
  apiKey?: string;
  temperature: number;
  maxTokens?: number;
  /** Which preset (free/local/cloud) this provider came from, for the UI. */
  providerId?: string;
}

export interface CustomModelPreset {
  id: string;
  displayName: string;
  contextLength: number;
  temperature: number;
  systemPrompt?: string;
}

export interface Settings {
  provider: ProviderConfig;
  model: string;
  customModels: CustomModelPreset[];
  systemPrompt: string;
  /** Research-Augmented Generation: web research before replying */
  ragEnabled: boolean;
  /** Auto-save chat snippets to long-term memory */
  autoRemember: boolean;
  /** Speak Talia's replies aloud via local TTS */
  ttsEnabled: boolean;
}

export type Role = "user" | "assistant" | "system";

export interface MediaAttachment {
  kind: "image" | "audio" | "video";
  url: string;
  mime?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  model?: string;
  createdAt: number;
  media?: MediaAttachment;
  sources?: ResearchSource[];
}

export interface ResearchSource {
  n: number;
  title: string;
  url: string;
  snippet?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  /** Who Talia is in this chat — defaults to her usual self when absent. */
  persona?: Persona;
}

export interface Persona {
  kind: "talia" | "bot";
  /** For kind === "bot": the bot id (builtin-* or a user bot id). */
  id?: string;
  name?: string;
  emoji?: string;
}

export interface MemoryItem {
  id: string;
  text: string;
  source: string;
  ts: number;
  count?: number;
  score?: number;
}

export interface CatalogModel {
  id: string;
  name: string;
  family: string;
  size: string;
  tags: string[];
  blurb: string;
}
