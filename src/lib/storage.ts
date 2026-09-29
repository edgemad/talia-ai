import { DEFAULT_SETTINGS, SESSIONS_KEY, STORAGE_KEY } from "./constants";
import type { ChatSession, Settings } from "../types";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...parsed,
      provider: { ...DEFAULT_SETTINGS.provider, ...(parsed.provider ?? {}) },
      customModels: Array.isArray(parsed.customModels) ? parsed.customModels : [],
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable — settings stay session-only
  }
}

export function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatSession[]) : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: ChatSession[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(-50)));
  } catch {
    // ignore quota errors
  }
}

/** One-time-ish migration: move any v1 chat into a session so nothing is lost. */
export function migrateV1Chat(): { sessions: ChatSession[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem("talia-ai:chat:v1");
    if (!raw) return { sessions: [], activeId: null };
    const messages = JSON.parse(raw);
    if (!Array.isArray(messages) || messages.length === 0) return { sessions: [], activeId: null };
    const id = `mig-${Date.now().toString(36)}`;
    return {
      sessions: [
        {
          id,
          title: "Our first conversations 🌸",
          messages: messages as ChatSession["messages"],
          createdAt: messages[0]?.createdAt ?? Date.now(),
          updatedAt: messages[messages.length - 1]?.createdAt ?? Date.now(),
        },
      ],
      activeId: id,
    };
  } catch {
    return { sessions: [], activeId: null };
  }
}
