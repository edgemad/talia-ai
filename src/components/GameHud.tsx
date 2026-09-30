import { motion } from "framer-motion";
import { RotateCcw, X } from "lucide-react";
import type { ActiveGame } from "../lib/gamesApi";

// ---------- boards -----------------------------------------------------------

function TicTacToeBoard({ state }: { state: Record<string, unknown> }) {
  const board = (state.board as string[] | undefined) ?? Array(9).fill("");
  const winLine = (state.winLine as number[] | undefined) ?? [];
  return (
    <div className="grid grid-cols-3 gap-1.5" style={{ width: 168 }}>
      {Array.from({ length: 9 }, (_, i) => (
        <div
          key={i}
          className="flex aspect-square items-center justify-center rounded-xl text-xl font-black transition"
          style={{
            background: winLine.includes(i)
              ? "color-mix(in srgb, var(--accent) 30%, transparent)"
              : "var(--surface-strong)",
            color: board[i] === "X" ? "var(--accent)" : board[i] === "O" ? "var(--accent-2)" : "var(--text-faint)",
          }}
        >
          {board[i] || i + 1}
        </div>
      ))}
    </div>
  );
}

function Connect4Board({ state }: { state: Record<string, unknown> }) {
  const board = (state.board as string[] | undefined) ?? Array(42).fill("");
  const winCells = (state.winCells as number[][] | undefined) ?? [];
  const cell = (r: number, c: number) => r * 7 + c;
  const isWin = (r: number, c: number) => winCells.some(([wr, wc]) => wr === r && wc === c);
  return (
    <div className="inline-block rounded-2xl p-1.5" style={{ background: "var(--surface-strong)" }}>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 42 }, (_, i) => {
          const r = Math.floor(i / 7);
          const c = i % 7;
          const v = board[cell(r, c)];
          return (
            <div
              key={i}
              className="flex h-6 w-6 items-center justify-center rounded-full text-[13px] transition"
              style={{
                background: v ? "transparent" : "var(--surface)",
                boxShadow: isWin(r, c) ? "0 0 0 2px var(--accent)" : undefined,
                fontSize: v ? 14 : 0,
              }}
            >
              {v === "X" ? "🔴" : v === "O" ? "🟡" : ""}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7 gap-1 pt-0.5 text-center text-[9px] font-bold" style={{ color: "var(--text-faint)" }}>
        {Array.from({ length: 7 }, (_, c) => (
          <span key={c}>{c + 1}</span>
        ))}
      </div>
    </div>
  );
}

// ---------- generic score chips ----------------------------------------------

function scoreChips(state: Record<string, unknown>): { label: string; value: string }[] {
  const chips: { label: string; value: string }[] = [];
  const add = (label: string, v: unknown, fmt: (x: number) => string = (x) => String(x)) => {
    if (typeof v === "number") chips.push({ label, value: fmt(v) });
  };
  add("Score", state.score);
  add("Round", state.round);
  add("Streak", state.streak);
  add("Lives", state.lives, (x) => "❤️".repeat(Math.max(0, Math.min(6, x))));
  add("Tries", state.tries);
  add("Questions left", state.questionsLeft);
  add("Solved", state.solved);
  if (typeof state.qNum === "number" && typeof state.total === "number") {
    chips.push({ label: "Question", value: `${state.qNum + 1}/${state.total}` });
  }
  if (typeof state.correct === "number" && typeof state.total === "number") {
    chips.push({ label: "Correct", value: `${state.correct}/${state.total}` });
  }
  if (typeof state.turn === "number" && typeof state.maxTurns === "number") {
    chips.push({ label: "Turn", value: `${Math.min(state.turn, state.maxTurns)}/${state.maxTurns}` });
  }
  if (typeof state.you === "number" && typeof state.me === "number") {
    chips.push({ label: "You vs Talia", value: `${state.you}–${state.me}` });
  }
  return chips.slice(0, 5);
}

const STATUS_STYLE: Record<string, { label: string; bg: string }> = {
  won: { label: "You win! 🏆", bg: "color-mix(in srgb, #22c55e 22%, transparent)" },
  lost: { label: "Talia wins 😄", bg: "color-mix(in srgb, #f59e0b 22%, transparent)" },
  draw: { label: "Draw 🤝", bg: "color-mix(in srgb, #38bdf8 22%, transparent)" },
  playing: { label: "Playing", bg: "color-mix(in srgb, var(--accent) 18%, transparent)" },
};

// ---------- HUD ----------------------------------------------------------------

export function GameHud({
  game,
  onEnd,
  onPlayAgain,
  busy,
}: {
  game: ActiveGame;
  onEnd: () => void;
  onPlayAgain: () => void;
  busy?: boolean;
}) {
  const status = String(game.state.status ?? "playing");
  const st = STATUS_STYLE[status] ?? STATUS_STYLE.playing;
  const chips = scoreChips(game.state);
  const boardGameId = game.gameId;
  const showTicTacToe = boardGameId === "tictactoe";
  const showConnect4 = boardGameId === "connect4";
  const lives = typeof game.state.lives === "number" ? game.state.lives : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-strong mx-auto mb-1 w-[min(94%,42rem)] rounded-3xl px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <span className="text-xl">{game.emoji}</span>
        <span className="text-[13px] font-extrabold" style={{ color: "var(--text)" }}>
          {game.name}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
          style={{ background: st.bg, color: "var(--text)" }}
        >
          {st.label}
        </span>
        <div className="flex-1" />
        {status !== "playing" && (
          <button
            onClick={onPlayAgain}
            disabled={busy}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold text-white shadow-plush disabled:opacity-40"
            style={{ background: "var(--accent-grad)" }}
          >
            <RotateCcw size={11} /> Play again
          </button>
        )}
        <button
          onClick={onEnd}
          className="rounded-full p-1.5 transition hover:bg-white/30"
          style={{ color: "var(--text-faint)" }}
          aria-label="End game"
        >
          <X size={14} />
        </button>
      </div>

      {(chips.length > 0 || lives !== null || showTicTacToe || showConnect4) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {showTicTacToe && <TicTacToeBoard state={game.state} />}
          {showConnect4 && <Connect4Board state={game.state} />}
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c.label}
                className="rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                style={{ background: "var(--surface-strong)", color: "var(--text-soft)" }}
              >
                {c.label}: <span style={{ color: "var(--accent)" }}>{c.value}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {game.howTo && status === "playing" && (
        <p className="mt-1.5 text-[10px] font-bold" style={{ color: "var(--text-faint)" }}>
          How to play: {game.howTo}
        </p>
      )}
    </motion.div>
  );
}
