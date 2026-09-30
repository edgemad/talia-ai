// 🤖 Bots & Skills — task-specific helpers that run on ANY provider
// (free local Ollama models or cloud APIs alike).
//
// A Bot = a persistent persona (name, emoji, system prompt) that can be bound
// to a chat session. A Skill = a one-shot task (summarize, review code,
// translate…) executed by the server with a carefully engineered prompt and
// appended to the session like any other message.
//
// Built-in bots are code; user bots are stored in ~/.talia-ai/bots.json.
import { readCollection, writeCollection } from "./store.mjs";

// ---------- Built-in bots ---------------------------------------------------
export const BUILTIN_BOTS = [
  {
    id: "builtin-coder",
    name: "Pixel",
    emoji: "💻",
    tagline: "Pair-programmer who explains clearly and writes clean code",
    builtin: true,
    systemPrompt:
      "You are Pixel, a meticulous pair-programmer. Follow the user's language. Prefer complete, runnable code over snippets. Explain tricky parts in 2-3 sentences after each code block. Call out edge cases and suggest tests. Never invent APIs — if unsure, say so.",
  },
  {
    id: "builtin-writer",
    name: "Quill",
    emoji: "✍️",
    tagline: "Editorial partner for writing, rewriting and tone",
    builtin: true,
    systemPrompt:
      "You are Quill, a warm, sharp editorial partner. Match the requested tone and length. Offer one alternative phrasing when it genuinely improves the text. Respect the user's voice — enhance, don't overwrite.",
  },
  {
    id: "builtin-analyst",
    name: "Sage",
    emoji: "📊",
    tagline: "Structured analyst: comparisons, pros/cons, decisions",
    builtin: true,
    systemPrompt:
      "You are Sage, a structured analyst. Answer with tight structure: short lead sentence, then compact bullets or a table. Quantify when possible, label assumptions explicitly, and end with a one-line bottom line.",
  },
  {
    id: "builtin-tutor",
    name: "Owl",
    emoji: "🦉",
    tagline: "Patient tutor with tiny steps and checks for understanding",
    builtin: true,
    systemPrompt:
      "You are Owl, a patient tutor. Explain in small steps from what the user already knows. Use one concrete example per concept, avoid jargon (or define it inline), and finish with a single quick question to check understanding.",
  },
  {
    id: "builtin-brainstormer",
    name: "Flick",
    emoji: "⚡",
    tagline: "Fast, wild idea generator — quantity first, refine later",
    builtin: true,
    systemPrompt:
      "You are Flick, a fast brainstormer. Generate many distinct ideas fast (aim for breadth over polish), each in one punchy line. Group them if natural, then flag the 2 wildest and the 1 most practical. No hedging, no filler.",
  },
  {
    id: "builtin-researcher",
    name: "Scout",
    emoji: "🔎",
    tagline: "Web researcher: finds sources, summarizes with citations",
    builtin: true,
    systemPrompt:
      "You are Scout, a rigorous web researcher. When given source material, ground every claim in it and cite like [1]. Prefer primary sources. Distinguish clearly between what sources say and what you infer. Note conflicts between sources.",
  },
];

// ---------- Built-in skills -------------------------------------------------
// `build` returns { system?, user } — the prompt the skill sends to the model.
// They are deliberately self-contained so any model can execute them.
export const BUILTIN_SKILLS = [
  {
    id: "summarize",
    name: "Summarize",
    emoji: "📝",
    icon: "summarize",
    description: "Condense the latest chat into key points",
    inputHint: "Optional focus, e.g. \"just the decisions\"",
    build: ({ text, context }) => ({
      system:
        "You are a summarization engine. Produce a tight summary: one overview sentence, then 3-6 bullet points of the essentials, then a final line starting with 'Next:' only if follow-ups exist. Keep every fact accurate to the material. No preamble.",
      user: context
        ? `Summarize this conversation${text ? ` (focus: ${text})` : ""}:\n\n${context}`
        : `Summarize this text${text ? ` (focus: ${text})` : ""}:\n\n${text}`,
    }),
  },
  {
    id: "review-code",
    name: "Review code",
    emoji: "🔍",
    icon: "code",
    description: "Careful code review with fixes",
    inputHint: "Paste code (or leave empty to review the chat's code)",
    build: ({ text, context }) => {
      const code = text?.trim() ? text : context || "";
      return {
        system:
          "You are a senior code reviewer. Structure: (1) one-line verdict, (2) bugs — each with severity and a concrete fix, (3) smaller nits, (4) a corrected version of the worst section if warranted. Be specific; reference line-ish locations. No praise padding.",
        user: `Review this code:\n\n${code}`,
      };
    },
  },
  {
    id: "translate",
    name: "Translate",
    emoji: "🌍",
    icon: "globe",
    description: "Translate the message into a language you pick",
    inputHint: "Target language, e.g. Japanese",
    build: ({ text, context }) => ({
      system:
        "You are a translation engine. Output ONLY the translation — no notes, no quotes, no transliteration unless the target script needs it. Preserve formatting and line breaks. If a term is ambiguous, choose the most common meaning.",
      user: `Translate into ${text?.trim() || "English"}:\n\n${context || ""}`.trim(),
    }),
  },
  {
    id: "explain",
    name: "Explain simply",
    emoji: "🧸",
    icon: "graduation",
    description: "Explain the latest topic in plain language",
    inputHint: "Optional: depth, e.g. \"for a 10-year-old\"",
    build: ({ text, context }) => ({
      system:
        "You explain things simply. Start with a one-sentence explanation a curious beginner gets instantly. Then a short everyday analogy. Then 2-3 key details worth knowing. No jargon without an inline definition. Warm tone, no condescension.",
      user: `Explain simply${text ? ` (${text})` : ""}:\n\n${context || text}`,
    }),
  },
  {
    id: "action-items",
    name: "Action items",
    emoji: "✅",
    icon: "check",
    description: "Extract next steps and owners from the chat",
    inputHint: "Optional context, e.g. \"for the launch team\"",
    build: ({ text, context }) => ({
      system:
        "You extract action items. Output a markdown checklist: '- [ ] task — owner (if known) — deadline (if mentioned)'. Merge duplicates, order by urgency, flag missing owners/deadlines with '?'. Then one line: 'Blockers:' (or 'None'). Nothing else.",
      user: `Extract action items${text ? ` (${text})` : ""} from:\n\n${context}`,
    }),
  },
  {
    id: "email",
    name: "Draft email",
    emoji: "✉️",
    icon: "mail",
    description: "Turn a rough idea into a send-ready email",
    inputHint: "Describe the email you need",
    build: ({ text, context }) => ({
      system:
        "You draft emails. Output only the email: Subject line, then body. Match a friendly-professional tone, keep it under 150 words unless asked, end with a clear ask. Placeholders in [brackets] where you need info.",
      user: `Draft an email${text ? `: ${text}` : ""}${context ? `\n\nContext from our chat:\n${context}` : ""}`,
    }),
  },
];

export function getBot(id) {
  return BUILTIN_BOTS.find((b) => b.id === id) || null;
}

export function getSkill(id) {
  return BUILTIN_SKILLS.find((s) => s.id === id) || null;
}

// ---------- User bots (persisted) ------------------------------------------
export async function listUserBots() {
  return readCollection("bots", []);
}

export async function saveBot(bot) {
  const bots = await listUserBots();
  const id = bot.id || `bot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const clean = {
    id,
    name: String(bot.name || "Unnamed bot").slice(0, 40),
    emoji: String(bot.emoji || "🤖").slice(0, 8),
    tagline: String(bot.tagline || "").slice(0, 140),
    systemPrompt: String(bot.systemPrompt || "").slice(0, 4000),
    createdAt: Date.now(),
  };
  const idx = bots.findIndex((b) => b.id === id);
  if (idx >= 0) bots[idx] = { ...bots[idx], ...clean };
  else bots.push(clean);
  writeCollection("bots", bots.slice(0, 100));
  return clean;
}

export async function deleteBot(id) {
  const bots = await listUserBots();
  const next = bots.filter((b) => b.id !== id);
  writeCollection("bots", next);
  return next.length !== bots.length;
}
