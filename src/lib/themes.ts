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
    id: "dragon",
    name: "Dragon Lagoon",
    emoji: "🐉",
    blurb: "Baby dragon soaring on mint clouds.",
    swatch: ["#86EFAC", "#34D399", "#FBBF24"],
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
    // legacy name: the dino grew up into a dragon
    const id = t === "dino" ? "dragon" : t;
    return THEMES.some((x) => x.id === id) ? (id as string) : DEFAULT_THEME;
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
// Reachability probes: real 200 responses from CDNs that send
// `Access-Control-Allow-Origin: *`, so the webview is allowed to read them.
// (The old probe URL `npm/ping@1.0.2/package.json` 404s, which made Talia
// believe it was offline forever — even with a perfectly working connection.)
const ONLINE_PROBES = [
  "https://cdn.jsdelivr.net/npm/react@18.3.1/package.json",
  "https://unpkg.com/react@18.3.1/package.json",
];

export async function verifyOnline(timeoutMs = 2500): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  for (const url of ONLINE_PROBES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const r = await fetch(url, { signal: controller.signal, cache: "no-store" });
      clearTimeout(timer);
      if (r.ok) return true;
    } catch {
      // probe failed (timeout, DNS, captive portal) — try the next one
    }
  }
  return false;
}
