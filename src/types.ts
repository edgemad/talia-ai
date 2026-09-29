export interface ProviderConfig {
  baseUrl: string;
  apiKey?: string;
  temperature: number;
  maxTokens?: number;
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
}

export type Role = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  model?: string;
  createdAt: number;
}
