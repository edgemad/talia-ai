export interface ThemeDef {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  swatch: [string, string, string];
}

export const THEMES: ThemeDef[] = [
  {
    id: "sakura",
    name: "Sakura",
    emoji: "🌸",
    blurb: "The original cozy blush & lavender.",
    swatch: ["#FFB8C6", "#FF9EB2", "#B294EE"],
  },
  {
    id: "ocean",
    name: "Ocean Glass",
    emoji: "🌊",
    blurb: "Cool blue glass, crisp sea air.",
    swatch: ["#7DD3FC", "#38BDF8", "#818CF8"],
  },
  {
    id: "dino",
    name: "Dino Lagoon",
    emoji: "🦕",
    blurb: "Baby dino splashing in teal water.",
    swatch: ["#5EEAD4", "#2DD4BF", "#38BDF8"],
  },
  {
    id: "matcha",
    name: "Matcha",
    emoji: "🍵",
    blurb: "Calm green tea & soft sunlight.",
    swatch: ["#4ADE80", "#A3E635", "#FACC15"],
  },
  {
    id: "midnight",
    name: "Midnight Glass",
    emoji: "🌙",
    blurb: "Deep dark glass with violet glow.",
    swatch: ["#C084FC", "#F472B6", "#1E1B2E"],
  },
];

export const DEFAULT_THEME = "sakura";
const THEME_KEY = "talia-ai:theme";

export function loadTheme(): string {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return THEMES.some((x) => x.id === t) ? (t as string) : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(id: string): void {
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* session-only */
  }
}

export function applyTheme(id: string): void {
  document.documentElement.setAttribute("data-theme", id);
}

/** Tiny connectivity probe: online() mirrors navigator, verify() does a real fetch. */
export async function verifyOnline(timeoutMs = 2500): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const r = await fetch("https://cdn.jsdelivr.net/npm/ping@1.0.2/package.json", {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    return r.ok;
  } catch {
    return false;
  }
}
