// Super Hop — the platformer engine.
//
// The rules all live in shared/marioCore.mjs so the canvas client and this
// engine can never disagree about what happened. This file is the arcade-facing
// wrapper: it turns a line of input into a run of simulation ticks, and turns
// the result into either a text frame (chat) or a one-line note (canvas).
//
// Two ways in:
//   • the canvas sends `go <chars>` — one character per 1/60s tick, batched a
//     few times a second, which is what keeps the server authoritative without
//     a round trip per frame.
//   • someone types `go right` / `jump` / `wait` in the chat, which expands to
//     a fixed burst of ticks so the game is playable without a canvas at all.

import {
  GOAL_X,
  INPUT_CHARS,
  LEVEL_SPECS,
  TICK_HZ,
  VIEW_H,
  VIEW_W,
  advance,
  coinsTotal,
  makeState,
  progress,
  renderWorld,
  summarize,
} from "../shared/marioCore.mjs";

/** Hard ceiling on ticks per call — one call may never fast-forward the level. */
export const MAX_TICKS = 180;

/** Typing a verb in chat runs for this many ticks unless the verb says otherwise. */
const ONE_SECOND = TICK_HZ;
const JUMP_BURST = 16;

function repeat(ch, n) {
  return ch.repeat(Math.max(0, Math.min(n, MAX_TICKS)));
}

/** Chat verbs -> input strings. */
const VERBS = [
  [/^(?:go |run )?right$/, () => repeat("r", ONE_SECOND)],
  [/^(?:go |run )?left$/, () => repeat("l", ONE_SECOND)],
  [/^(?:hop|jump|bounce)$/, () => repeat("j", JUMP_BURST)],
  [/^(?:hop|jump) right$/, () => repeat("r", 45) + repeat("R", JUMP_BURST)],
  [/^(?:hop|jump) left$/, () => repeat("l", 45) + repeat("L", JUMP_BURST)],
  [/^(?:stop|wait|rest)$/, () => repeat("-", 12)],
  [/^(?:coin|coins|money)$/, () => repeat("R", JUMP_BURST)],
];

/**
 * Turn whatever was typed (or sent by the canvas) into a run of input.
 *
 * Order matters. `go right` has to reach the verb table, while `go rrRR` from
 * the canvas has to reach the raw path — so exact words are tried first, and
 * only a payload made purely of input characters counts as raw. Checking the
 * payload's alphabet is what keeps "right" from being read as five ticks of
 * r-i-g-h-t, of which only the r does anything.
 */
export function inputFor(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return "";

  // Verbs are matched case-insensitively...
  for (const [re, build] of VERBS) if (re.test(raw.toLowerCase())) return build();

  // ...but the raw payload keeps its case, because an uppercase R means
  // "run and jump". Lowercasing it here would silently drop every canvas jump.
  const prefixed = /^(?:go|move|play|run)\s+(.*)$/i.exec(raw);
  if (prefixed) {
    const payload = prefixed[1].replace(/\s+/g, "");
    // Anything made only of input characters is a batch, even a one-tick one.
    if (payload.length >= 1 && [...payload].every((c) => INPUT_CHARS.includes(c))) return payload;
  }
  return "";
}

function statusLine(s) {
  const pct = Math.round(progress(s) * 100);
  if (s.status === "won") return `🏁 You reached the flag! Score ${s.score}.`;
  if (s.status === "lost") return `💔 Out of lives at ${pct}% of the level. Score ${s.score}.`;
  return (
    `🪙 ${s.coinsGot}/${coinsTotal(s)} coins · ⭐ ${s.score} · ❤️ ${s.lives} · ` +
    `${pct}% of the way to the flag`
  );
}

function frame(s) {
  return `${renderWorld(s)}\n${statusLine(s)}`;
}

/** The bits of the world shape the canvas needs, published once per round. */
function publish(s) {
  return { ...s, levelW: GOAL_X + 5, viewW: VIEW_W, viewH: VIEW_H, coinsTotal: coinsTotal(s) };
}

/**
 * `levels` lists the level select; `level 3` or `level 3-1` jumps straight there.
 *
 * Parsed before `inputFor`, because a level number is made of characters the
 * input alphabet also owns — `go 2-1` would otherwise be read as three ticks of
 * standing still.
 */
function levelCommand(asked) {
  const m = /^(?:levels?|world)\b\s*(.*)$/.exec(asked);
  if (!m) return null;
  const want = m[1].trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!want) {
    return LEVEL_SPECS.map((l, i) => `${i + 1}. **${l.id} ${l.name}** — ${l.blurb}`).join("\n");
  }
  const byId = LEVEL_SPECS.findIndex((l) => l.id.toLowerCase() === want);
  const byNo = Number(want);
  const index = byId >= 0 ? byId : Number.isInteger(byNo) ? byNo - 1 : -1;
  if (index < 0 || index >= LEVEL_SPECS.length) {
    return `I only have ${LEVEL_SPECS.map((l) => l.id).join(", ")}. Try \`levels\`.`;
  }
  return publish(makeState({ level: index }));
}

/**
 * The line Talia says when someone plays by typing.
 *
 * Deliberately no ASCII art here. The world is drawn on a canvas; dropping
 * `#####^@###` into the chat underneath it looked like a computer terminal and
 * made the whole game read as a text toy. `look` still prints the map if
 * someone actually wants it.
 */
function narrate(before, after) {
  const gained = after.coinsGot - before.coinsGot;
  const score = after.score - before.score;
  const parts = [];
  if (gained) parts.push(`🪙 ${gained === 1 ? "a coin" : `${gained} coins`}!`);
  if (score > gained * 10) parts.push("💥 Stomped a critter!");
  if (after.status === "won") return "🏁 You made it to the flag! What a run.";
  if (after.lives < before.lives) {
    parts.push(after.status === "lost" ? "" : "💨 Ouch! Mind the critters.");
  }
  const bit = parts.filter(Boolean).join(" ");
  return bit ? `${bit} ${statusLine(after)}` : statusLine(after);
}

export const mario = {
  id: "mario",

  seed(opts = {}) {
    // The client only needs to know the shape of the world once.
    return publish(makeState(opts));
  },

  /**
   * @param {object} state
   * @param {string} text   `go <chars>` from the canvas, or a chat verb
   * @param {{quiet?: boolean}} [opts]  quiet -> attach a `note` for the toast
   */
  step(state, text, opts = {}) {
    const asked = String(text ?? "").trim().toLowerCase();
    const wanted = levelCommand(asked);
    if (wanted) {
      const level = LEVEL_SPECS[wanted.level];
      const reply =
        typeof wanted === "string"
          ? wanted
          : `🌍 **${wanted.levelId} — ${wanted.levelName}**\n${level.blurb}\n\n${statusLine(wanted)}`;
      return { state: typeof wanted === "string" ? state : wanted, reply, note: opts.quiet ? reply.split("\n")[0] : "" };
    }
    if (/^(help|commands|\?)$/.test(asked)) {
      const help = [
        "🍄 **Super Hop** — you can play with the arrow keys above, or just type:",
        "",
        "- `go right` / `go left` — run",
        "- `jump` — hop on the spot",
        "- `hop right` — build up speed and leap a gap",
        "- `stop` — stand still",
        "- `status` — score, coins and how far you've got",
        "- `levels` — list the levels, `level 2-2` to jump to one",
        "- `look` — print the map (the canvas already shows it)",
        "",
        "Stomp the critters, dodge the rest, and grab the coins on the way to the flag. 🏁",
      ].join("\n");
      return { state, reply: help, note: opts.quiet ? "🗺 Here's how to play" : "" };
    }

    const input = inputFor(text);

    if (state.status !== "playing") {
      return { state, reply: statusLine(state), note: opts.quiet ? statusLine(state) : "" };
    }

    if (/^(look|map|view|where)$/.test(asked)) {
      return { state, reply: frame(state), note: opts.quiet ? "🗺 Here's where you are" : "" };
    }

    if (!input) {
      // Nothing runnable: hold the world still rather than silently eating a
      // turn, and say so, so chat players aren't left guessing.
      const reply = "Try `go right`, `jump`, or `hop right` — or type `help` for the lot.";
      return { state, reply, note: opts.quiet ? "🙃 Nothing happened" : "" };
    }

    const limited = input.slice(0, MAX_TICKS);
    const next = advance(state, limited);
    // Events accumulate across the whole batch; keep only the last tick's worth
    // so the state we hand back stays small.
    const note = summarize(next.events);
    const trimmed = { ...next, events: next.events.slice(-1) };

    if (!opts.quiet) return { state: trimmed, reply: narrate(state, trimmed) };
    return { state: trimmed, note };
  },

  intro(state) {
    const which = state?.levelCount > 1 ? ` — **${state.levelId} ${state.levelName}**` : "";
    return [
      `🍄 **Super Hop!**${which} Use the **← → arrow keys** to run and **Space** to jump.`,
      "Stomp the critters, dodge the rest, and grab every coin on the way to the flag. 🏁",
      "",
      state?.levelCount > 1 ? `There are ${state.levelCount} levels — type \`levels\` to see them, or pick one above the game.` : "",
      "You can also type `go right`, `jump` or `hop right` if you'd rather not use the keyboard.",
    ]
      .filter(Boolean)
      .join("\n");
  },

  systemPrompt() {
    return "You are the narrator for a simple platformer. Keep it to one short encouraging line.";
  },

  fallback(state) {
    return statusLine(state);
  },

  parseLlmReply() {
    return null;
  },

  // Handy for tests and for the engine's own self-checks.
  helpers: { inputFor, statusLine, frame, MAX_TICKS, progress },
};
