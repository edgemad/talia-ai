// Skill prompt builders — mirrors server/bots.mjs so skills run through the
// normal /api/chat stream (stop buttons, markdown, sources all just work).
// Keep in sync with BUILTIN_SKILLS when adding skills.

export interface BuiltPrompt {
  system?: string;
  user: string;
}

interface SkillArgs {
  text?: string;
  context?: string;
}

export interface SkillRunner {
  id: string;
  name: string;
  emoji: string;
  description: string;
  inputHint: string;
  build: (args: SkillArgs) => BuiltPrompt;
}

export const SKILLS: SkillRunner[] = [
  {
    id: "summarize",
    name: "Summarize",
    emoji: "📝",
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
    description: "Turn a rough idea into a send-ready email",
    inputHint: "Describe the email you need",
    build: ({ text, context }) => ({
      system:
        "You draft emails. Output only the email: Subject line, then body. Match a friendly-professional tone, keep it under 150 words unless asked, end with a clear ask. Placeholders in [brackets] where you need info.",
      user: `Draft an email${text ? `: ${text}` : ""}${context ? `\n\nContext from our chat:\n${context}` : ""}`,
    }),
  },
];

// ---------- Custom skills (user-defined, stored locally) -------------------

export interface CustomSkillDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  inputHint: string;
  /** How Talia should think/format for this skill. */
  systemPrompt: string;
  /** User-message template. {{text}} = your input, {{context}} = this chat. */
  userTemplate: string;
}

const CUSTOM_KEY = "talia-ai:custom-skills:v1";

export function loadCustomSkills(): CustomSkillDef[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const list = raw ? (JSON.parse(raw) as CustomSkillDef[]) : [];
    return Array.isArray(list)
      ? list.filter((s) => s && s.id && s.name && s.systemPrompt)
      : [];
  } catch {
    return [];
  }
}

function saveCustomSkills(list: CustomSkillDef[]): void {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list.slice(-100)));
  } catch {
    /* storage full or unavailable */
  }
}

export function upsertCustomSkill(
  def: Omit<CustomSkillDef, "id"> & { id?: string },
): CustomSkillDef {
  const list = loadCustomSkills();
  const id =
    def.id ||
    `custom-${
      def.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || Date.now().toString(36)
    }`;
  const next: CustomSkillDef = { ...def, id };
  saveCustomSkills([...list.filter((s) => s.id !== next.id), next]);
  return next;
}

export function deleteCustomSkill(id: string): void {
  saveCustomSkills(loadCustomSkills().filter((s) => s.id !== id));
}

function interpolate(tpl: string, args: SkillArgs): string {
  return tpl
    .replaceAll("{{text}}", args.text?.trim() ?? "")
    .replaceAll("{{context}}", args.context?.trim() ?? "");
}

function customToRunner(def: CustomSkillDef): SkillRunner {
  return {
    id: def.id,
    name: def.name,
    emoji: def.emoji || "✨",
    description: def.description || "Your custom skill",
    inputHint: def.inputHint || "Input for this skill",
    build: ({ text, context }) => {
      const tpl = def.userTemplate.trim();
      let user: string;
      if (tpl) {
        user = interpolate(tpl, { text: text ?? "", context: context ?? "" });
        // If the template ignores the placeholders, the typed input still has
        // to reach the model somehow — append it.
        if (!tpl.includes("{{text}}") && !tpl.includes("{{context}}") && text?.trim()) {
          user = `${user}\n\n${text.trim()}`;
        }
      } else {
        user = [text?.trim(), context?.trim()].filter(Boolean).join("\n\n") || "(no input)";
      }
      return { system: def.systemPrompt, user };
    },
  };
}

/** Builtin + user-created skills, in list order. */
export function allSkills(): SkillRunner[] {
  return [...SKILLS, ...loadCustomSkills().map(customToRunner)];
}

export function skillById(id: string): SkillRunner | null {
  return allSkills().find((s) => s.id === id) ?? null;
}
