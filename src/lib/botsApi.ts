// Client for Talia's bots, skills and provider-preset APIs.

export interface BotDef {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  builtin?: boolean;
  systemPrompt?: string;
}

export interface SkillDef {
  id: string;
  name: string;
  emoji: string;
  icon: string;
  description: string;
  inputHint: string;
}

export interface ProviderPresetDTO {
  id: string;
  name: string;
  baseUrl: string;
  needsKey: boolean;
  hint: string;
}

export async function fetchBots(): Promise<BotDef[]> {
  try {
    const r = await fetch("/api/bots");
    const j = await r.json();
    return j?.ok ? j.bots : [];
  } catch {
    return [];
  }
}

export async function createBot(bot: { name: string; emoji: string; tagline: string; systemPrompt: string }) {
  const r = await fetch("/api/bots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bot),
  });
  return r.json() as Promise<{ ok: boolean; bot?: BotDef; error?: string }>;
}

export async function deleteBot(id: string) {
  await fetch(`/api/bots/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchSkills(): Promise<SkillDef[]> {
  try {
    const r = await fetch("/api/skills");
    const j = await r.json();
    return j?.ok ? j.skills : [];
  } catch {
    return [];
  }
}

export async function fetchProviderPresets(): Promise<ProviderPresetDTO[]> {
  try {
    const r = await fetch("/api/providers");
    const j = await r.json();
    return j?.ok ? j.providers : [];
  } catch {
    return [];
  }
}
