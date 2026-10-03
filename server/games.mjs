// 🎮 Games Arcade — kids & teens play WITH Talia.
//
// Design rules that make this standalone, fast, and reliable:
// - Every built-in game runs on a deterministic engine in Node: state, move
//   validation, scoring and AI moves are computed locally, never by the LLM.
//   Games are instant, work offline, and a chatty model can't break the rules.
// - The LLM is only the *voice* (oracle answers, storytelling, flavor). When
//   no provider is reachable, engines supply fallback text so games never
//   dead-end mid-round.
// - Downloadable catalogue packs are pure DATA (word banks, quizzes, prompt
//   packs) validated on install — pack code is never executed.

import { readCollection, writeCollection } from "./store.mjs";
import { CATALOGUE } from "./gamePacks.mjs";
import { blockcraft } from "./blockcraft.mjs";
import { mario } from "./mario.mjs";

// ---------- tiny helpers -----------------------------------------------------
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Normalize free text for answer matching: lowercase, strip punctuation. */
const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const firstWord = (s) => norm(s).split(" ")[0] || "";

// ---------- engine contract --------------------------------------------------
// Each engine implements:
//   seed(opts)               → fresh state (pure-ish; uses Math.random)
//   step(state, input)       → { state, reply?, needsLlm?, prompt?, done? }
//   intro(state)             → opening line shown when the game starts
//   systemPrompt(state, g)   → system prompt for the LLM (when needsLlm)
//   fallback(state, input)   → deterministic reply used if the provider fails
// `state.status` ∈ "playing" | "won" | "lost" | "draw".

const won = (s, extra = {}) => ({ ...s, status: "won", ...extra });
const lost = (s, extra = {}) => ({ ...s, status: "lost", ...extra });

// ---------- guess the number -------------------------------------------------
const GUESS_NUMBER_BANK = {
  easy: { min: 1, max: 50, maxTries: 8 },
  hard: { min: 1, max: 100, maxTries: 7 },
};

const guessNumber = {
  id: "guess-number",
  seed(opts = {}) {
    const cfg = GUESS_NUMBER_BANK[opts.difficulty === "hard" ? "hard" : "easy"];
    return {
      secret: cfg.min + Math.floor(Math.random() * (cfg.max - cfg.min + 1)),
      min: cfg.min,
      max: cfg.max,
      tries: 0,
      maxTries: cfg.maxTries,
      lastHint: null,
      status: "playing",
    };
  },
  intro: (s) => `🔢 I'm thinking of a number from ${s.min} to ${s.max} — can you guess it in ${s.maxTries} tries or fewer? Type a number to play!`,
  step(state, input) {
    if (state.status !== "playing") return { state, reply: "That round is over — start the game again to play more! 🎲" };
    const n = Number(String(input).replace(/[^0-9-]/g, ""));
    if (!Number.isInteger(n) || n < state.min || n > state.max) {
      return { state, reply: `I need a whole number between ${state.min} and ${state.max} — what's your guess?` };
    }
    const tries = state.tries + 1;
    if (n === state.secret) {
      const stars = tries <= Math.ceil(state.maxTries / 2) ? "⭐⭐⭐" : tries < state.maxTries ? "⭐⭐" : "⭐";
      return {
        state: won({ ...state, tries, lastHint: "correct" }, { score: tries }),
        reply: `🎉 YES! ${n} was my number! You got it in ${tries} ${tries === 1 ? "try" : "tries"} ${stars} — want to play again?`,
      };
    }
    const hint = n < state.secret ? "higher ⬆️" : "lower ⬇️";
    if (tries >= state.maxTries) {
      return {
        state: lost({ ...state, tries, lastHint: hint }),
        reply: `💔 Out of tries — my number was ${state.secret}. You were so close! Want a rematch?`,
      };
    }
    const warm = Math.abs(n - state.secret) <= 5 ? " You're really warm! 🔥" : "";
    return {
      state: { ...state, tries, lastHint: hint },
      reply: `${hint} — try again! (${state.maxTries - tries} ${state.maxTries - tries === 1 ? "try" : "tries"} left)${warm}`,
    };
  },
  fallback: (s) => `My brain-box is napping, but the game is fair: ${s.lastHint ? `my last hint was "${s.lastHint}".` : ""} Keep guessing!`,
};

// ---------- quick math -------------------------------------------------------
const MATH_LEVELS = {
  1: "Addition & subtraction up to 20",
  2: "Times tables up to 10, plus easy division",
  3: "Bigger numbers, mixed operations",
};

function mathQuestion(level) {
  const r = (n) => 1 + Math.floor(Math.random() * n);
  if (level === 1) {
    const a = r(10), b = r(10);
    return Math.random() < 0.5
      ? { q: `${a} + ${b}`, answer: a + b }
      : { q: `${a + b} − ${b}`, answer: a };
  }
  if (level === 2) {
    const a = r(10), b = r(10);
    const roll = Math.random();
    if (roll < 0.6) return { q: `${a} × ${b}`, answer: a * b };
    return { q: `${a * b} ÷ ${b}`, answer: a };
  }
  const a = 5 + r(20), b = 2 + r(9);
  const roll = Math.random();
  if (roll < 0.4) return { q: `${a} + ${b} × ${b}`, answer: a + b * b };
  if (roll < 0.8) return { q: `${a} × ${b}`, answer: a * b };
  return { q: `${a * b} ÷ ${b} + ${a}`, answer: 2 * a };
}

const quickMath = {
  id: "quick-math",
  seed(opts = {}) {
    const level = Math.min(3, Math.max(1, Number(opts.level) || 1));
    const q = mathQuestion(level);
    return { level, total: 10, qNum: 0, correct: 0, streak: 0, best: 0, question: q.q, answer: q.answer, status: "playing" };
  },
  intro: (s) => `🧮 Quick Math, Level ${s.level} (${MATH_LEVELS[s.level]})! 10 questions — type the answer. Here's #1: what is ${s.question}?`,
  step(state, input) {
    if (state.status !== "playing") return { state, reply: "Round finished — start Quick Math again for a new set! 🧮" };
    const n = Number(String(input).replace(/[^0-9-]/g, ""));
    if (!Number.isInteger(n)) {
      return { state, reply: `Type just the number for ${state.question} 🙂` };
    }
    const ok = n === state.answer;
    const qNum = state.qNum + 1;
    const correct = state.correct + (ok ? 1 : 0);
    const streak = ok ? state.streak + 1 : 0;
    const best = Math.max(state.best, streak);
    if (qNum >= state.total) {
      const pct = Math.round((correct / state.total) * 100);
      const praise = pct >= 90 ? "MATH WIZARD! 🧙‍♂️✨" : pct >= 70 ? "Superb counting! 🌟" : pct >= 50 ? "Good work — practice makes progress! 💪" : "Every genius starts somewhere — again? 🌱";
      return {
        state: won({ ...state, qNum, correct, streak, best }, { score: correct }),
        reply: `🏁 All done! You scored ${correct}/${state.total} (${pct}%) with a best streak of ${best} ${best >= 3 ? "🔥" : ""}. ${praise} (The answer was ${state.answer}.)`,
      };
    }
    const q = mathQuestion(state.level);
    const streakNote = streak >= 3 ? ` ${streak} in a row — on fire! 🔥` : "";
    return {
      state: { ...state, qNum, correct, streak, best, question: q.q, answer: q.answer },
      reply: `${ok ? `✅ Correct!` : `❌ It was ${state.answer}.`}${streakNote} #${qNum + 1}: what is ${q.q}?`,
    };
  },
  fallback: (s) => `No calculator connection, but I believe in you: ${s.question} = ?`,
};

// ---------- tic-tac-toe ------------------------------------------------------
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

function ttWinner(b) {
  for (const [a, c, d] of LINES) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { mark: b[a], line: [a, c, d] };
  }
  return b.every(Boolean) ? { mark: "draw", line: [] } : null;
}

function ttMinimax(b, me, turn) {
  const w = ttWinner(b);
  if (w) return { score: w.mark === me ? 1 : w.mark === "draw" ? 0 : -1 };
  const maximizing = turn === me;
  let best = null;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    const nb = [...b];
    nb[i] = turn;
    const r = ttMinimax(nb, me, turn === me ? (me === "X" ? "O" : "X") : me);
    if (!best || (maximizing ? r.score > best.score : r.score < best.score)) {
      best = { score: r.score, move: i };
    }
  }
  return best;
}

function ttBoardStr(b) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    rows.push(
      [0, 1, 2].map((c) => b[r * 3 + c] || String(r * 3 + c + 1)).join(" | "),
    );
  }
  return rows.join("\n");
}

const tictactoe = {
  id: "tictactoe",
  seed(opts = {}) {
    return {
      board: Array(9).fill(""),
      you: "X",
      ai: "O",
      difficulty: opts.difficulty === "easy" ? "easy" : "hard",
      turn: "you",
      status: "playing",
    };
  },
  intro: (s) => `⭕❌ Tic-Tac-Toe (${s.difficulty === "easy" ? "friendly" : "unbeatable"} mode)! You are X. Pick a cell 1–9:\n\n${ttBoardStr(s.board)}`,
  step(state, input) {
    if (state.status !== "playing") return { state, reply: "Game's over — hit Play again in the game panel! ⭕" };
    const cell = Number(firstWord(input).replace(/[^0-9]/g, "")) - 1;
    if (!Number.isInteger(cell) || cell < 0 || cell > 8 || state.board[cell]) {
      return { state, reply: `Pick an empty cell 1–9 🙂\n\n${ttBoardStr(state.board)}` };
    }
    let board = [...state.board];
    board[cell] = state.you;
    let w = ttWinner(board);
    if (w) return this.finish({ ...state, board }, w);
    // AI move
    const empty = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    let move;
    if (state.difficulty === "easy" && Math.random() < 0.55) {
      move = pick(empty);
    } else if (state.difficulty === "easy") {
      // easy but not dumb: block or win when one step away, else random
      move = this.smart(board, empty, true) ?? pick(empty);
    } else {
      move = ttMinimax(board, state.ai, state.ai).move;
    }
    board = [...board];
    board[move] = state.ai;
    w = ttWinner(board);
    if (w) return this.finish({ ...state, board }, w);
    return { state: { ...state, board }, reply: `My move is done — your turn! Pick a cell 1–9:\n\n${ttBoardStr(board)}` };
  },
  smart(board, empty, onlyBlock) {
    for (const mark of onlyBlock ? ["O"] : ["O", "X"]) {
      for (const i of empty) {
        const nb = [...board];
        nb[i] = mark;
        if (ttWinner(nb)?.mark === mark) return i;
      }
    }
    return null;
  },
  finish(state, w) {
    if (w?.mark === "draw") {
      return { state: { ...state, status: "draw", winLine: [] }, reply: `🤝 A draw! Great thinking.\n\n${ttBoardStr(state.board)}\n\nRematch?` };
    }
    if (w?.mark === state.you) {
      return { state: won({ ...state, winLine: w.line }), reply: `🎉 THREE IN A ROW — you win!\n\n${ttBoardStr(state.board)}\n\nI'll get you next time!` };
    }
    return { state: lost({ ...state, winLine: w?.line ?? [] }), reply: `😄 I win this one!\n\n${ttBoardStr(state.board)}\n\nWant to try again?` };
  },
  fallback: (s) => `Board so far:\n${ttBoardStr(s.board)}\n(I couldn't reach my model, but the rules engine is local — keep playing!)`,
};

// ---------- connect four -----------------------------------------------------
const C4_ROWS = 6, C4_COLS = 7;

function c4Drop(board, col, mark) {
  for (let r = C4_ROWS - 1; r >= 0; r--) {
    if (!board[r * C4_COLS + col]) {
      const nb = [...board];
      nb[r * C4_COLS + col] = mark;
      return { board: nb, row: r };
    }
  }
  return null;
}

function c4Winner(b) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      const mark = b[r * C4_COLS + c];
      if (!mark) continue;
      for (const [dr, dc] of dirs) {
        const cells = [[r, c]];
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < C4_ROWS && cc >= 0 && cc < C4_COLS && b[rr * C4_COLS + cc] === mark) {
          cells.push([rr, cc]);
          rr += dr; cc += dc;
        }
        if (cells.length >= 4) return { mark, cells };
      }
    }
  }
  return null;
}

function c4AiMove(board, diff) {
  const valid = [];
  for (let c = 0; c < C4_COLS; c++) if (!board[c]) valid.push(c);
  if (valid.length === 0) return null;
  // 1) win now
  for (const c of valid) if (c4Winner(c4Drop(board, c, "O").board)?.mark === "O") return c;
  // 2) block their win
  for (const c of valid) if (c4Winner(c4Drop(board, c, "X").board)?.mark === "X") return c;
  // 3) avoid gifting a win on top
  const safe = valid.filter((c) => {
    const d = c4Drop(board, c, "O");
    const above = d.row - 1;
    if (above < 0) return true;
    const nb = [...d.board];
    nb[above * C4_COLS + c] = "X";
    return c4Winner(nb)?.mark !== "X";
  });
  const pool = safe.length ? safe : valid;
  // 4) center first (strong heuristic), jitter for variety
  const centerScore = (c) => 10 - Math.abs(3 - c) + Math.random() * (diff === "easy" ? 9 : 2);
  return [...pool].sort((a, b) => centerScore(b) - centerScore(a))[0];
}

function c4BoardStr(b) {
  const rows = [];
  for (let r = 0; r < C4_ROWS; r++) {
    rows.push(
      "| " +
        Array.from({ length: C4_COLS }, (_, c) => {
          const v = b[r * C4_COLS + c];
          return v === "X" ? "🔴" : v === "O" ? "🟡" : "⚪";
        }).join(" ") +
        " |",
    );
  }
  rows.push("| " + Array.from({ length: C4_COLS }, (_, c) => String(c + 1)).join(" ") + " |");
  return rows.join("\n");
}

const connect4 = {
  id: "connect4",
  seed(opts = {}) {
    return {
      board: Array(C4_ROWS * C4_COLS).fill(""),
      you: "X", ai: "O",
      difficulty: opts.difficulty === "easy" ? "easy" : "hard",
      status: "playing",
    };
  },
  intro: (s) => `🔴🟡 Connect Four (${s.difficulty} mode)! You're 🔴. Drop a disc into a column 1–7:\n\n${c4BoardStr(s.board)}`,
  step(state, input) {
    if (state.status !== "playing") return { state, reply: "Game's over — start again from the game panel! 🔴🟡" };
    const col = Number(firstWord(input).replace(/[^0-9]/g, "")) - 1;
    if (!Number.isInteger(col) || col < 0 || col >= C4_COLS || state.board[col]) {
      return { state, reply: `Pick a column 1–7 that isn't full 🙂` };
    }
    const youMove = c4Drop(state.board, col, state.you);
    let w = c4Winner(youMove.board);
    if (w) {
      return {
        state: won({ ...state, board: youMove.board, winCells: w.cells }),
        reply: `🎉 FOUR IN A ROW — you win!\n\n${c4BoardStr(youMove.board)}\n\nBrilliantly played!`,
      };
    }
    const aiCol = c4AiMove(youMove.board, state.difficulty);
    if (aiCol == null) {
      return { state: { ...state, board: youMove.board, status: "draw" }, reply: `🤝 Board is full — a draw!\n\n${c4BoardStr(youMove.board)}` };
    }
    const aiMove = c4Drop(youMove.board, aiCol, state.ai);
    w = c4Winner(aiMove.board);
    if (w) {
      return {
        state: lost({ ...state, board: aiMove.board, winCells: w.cells }),
        reply: `😄 I connected four!\n\n${c4BoardStr(aiMove.board)}\n\nSo close — rematch?`,
      };
    }
    return {
      state: { ...state, board: aiMove.board },
      reply: `I dropped into column ${aiCol + 1}. Your move!\n\n${c4BoardStr(aiMove.board)}`,
    };
  },
  fallback: (s) => `The board is local so nothing is lost:\n${c4BoardStr(s.board)}\nYour move!`,
};

// ---------- rock paper scissors ----------------------------------------------
const RPS_BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };
const RPS_ALIASES = { r: "rock", p: "paper", s: "scissors", rock: "rock", paper: "paper", scissors: "scissors" };
const RPS_EMOJI = { rock: "🪨", paper: "📄", scissors: "✂️" };

const rps = {
  id: "rps",
  seed() {
    return { target: 5, you: 0, me: 0, ties: 0, round: 0, history: [], lastYou: null, status: "playing" };
  },
  intro: () => `🪨📄✂️ Rock Paper Scissors — first to 5 wins! Type rock, paper, or scissors.`,
  step(state, input) {
    if (state.status !== "playing") return { state, reply: "Match over — start again for a best-of-5! 🪨" };
    const you = RPS_ALIASES[firstWord(input)] || RPS_ALIASES[firstWord(input).replace(/s$/, "")];
    if (!you) return { state, reply: "Type rock 🪨, paper 📄, or scissors ✂️!" };
    // AI: counter your most frequent throw with some mischief
    const counts = { rock: 0, paper: 0, scissors: 0 };
    for (const h of state.history) counts[h]++;
    const fav = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const counterOf = (m) => Object.keys(RPS_BEATS).find((k) => RPS_BEATS[k] === m);
    let me = Math.random() < 0.35 ? pick(Object.keys(RPS_BEATS)) : counterOf(fav);
    if (me === you) me = Math.random() < 0.5 ? me : counterOf(pick(Object.values(RPS_BEATS)));
    const round = state.round + 1;
    const history = [...state.history, you].slice(-12);
    let { you: y, me: m, ties } = state;
    let line;
    if (you === me) {
      ties++;
      line = `${RPS_EMOJI[you]} vs ${RPS_EMOJI[me]} — a tie!`;
    } else if (RPS_BEATS[you] === me) {
      y++;
      line = `${RPS_EMOJI[you]} beats ${RPS_EMOJI[me]} — point to you! 🎉`;
    } else {
      m++;
      line = `${RPS_EMOJI[me]} beats ${RPS_EMOJI[you]} — point to me! 😜`;
    }
    const score = `Score — you ${y} · me ${m} · ties ${ties}`;
    if (y >= state.target) {
      return { state: won({ ...state, round, history, you: y, me: m, ties }, { score: y }), reply: `${line}\n${score}\n\n🏆 MATCH — you win ${y} to ${m}! Champion!` };
    }
    if (m >= state.target) {
      return { state: lost({ ...state, round, history, you: y, me: m, ties }), reply: `${line}\n${score}\n\n🏆 I take the match ${m} to ${y}! Rematch?` };
    }
    return { state: { ...state, round, history, you: y, me: m, ties }, reply: `${line}\n${score} — next throw!` };
  },
  fallback: () => `My crystal hand is offline — but rock still beats scissors. Your throw? 🪨`,
};

// ---------- hangman ----------------------------------------------------------
const HANGMAN_WORDS = [
  ["animals", "elephant", "It's the biggest land animal"], ["animals", "penguin", "A bird in a tuxedo"],
  ["animals", "kangaroo", "Hops with a pouch"], ["animals", "butterfly", "Caterpillar's dream"],
  ["animals", "dolphin", "Smart ocean acrobat"], ["animals", "giraffe", "Neck above the rest"],
  ["animals", "octopus", "Eight arms, three hearts"], ["animals", "cheetah", "Fastest land sprinter"],
  ["food", "pancake", "Flipped in a pan"], ["food", "spaghetti", "Twirly dinner"],
  ["food", "chocolate", "Sweet brown treat"], ["food", "avocado", "Green toast topper"],
  ["food", "pineapple", "Spiky crown, sweet inside"], ["food", "hamburger", "Stacked lunch"],
  ["school", "backpack", "Carries books on your back"], ["school", "scissors", "Two blades, one job"],
  ["school", "library", "Quiet house of books"], ["school", "notebook", "Paper home for ideas"],
  ["school", "paintbrush", "Makes colors dance"], ["school", "pencilcase", "Small bag of pens"],
  ["space", "astronaut", "Rides a rocket to work"], ["space", "telescope", "Brings stars closer"],
  ["space", "asteroid", "Space rock"], ["space", "galaxy", "Island of billions of stars"],
  ["space", "meteor", "Shooting star"], ["space", "satellite", "Orbiting messenger"],
  ["nature", "waterfall", "River that jumps"], ["nature", "rainbow", "Sky's colorful arch"],
  ["nature", "volcano", "Mountain that erupts"], ["nature", "glacier", "Slow river of ice"],
  ["nature", "lightning", "Sky's camera flash"], ["nature", "meadow", "Field of flowers"],
  ["fun", "trampoline", "Bouncy backyard"], ["fun", "kaleidoscope", "Tube of shifting patterns"],
  ["fun", "birthday", "Cake and candles day"], ["fun", "treasure", "X marks it"],
  ["fun", "carousel", "Roundabout horses"], ["fun", "popsicle", "Frozen summer treat"],
  ["tech", "keyboard", "Buttons for typing"], ["tech", "headphones", "Music straight to your ears"],
  ["tech", "robot", "Beep boop friend"], ["tech", "internet", "The worldwide web"],
  ["tech", "software", "Apps are made of it"], ["tech", "controller", "Game in your hands"],
];

const HANGMAN_STAGES = ["💚".repeat(6), "💛".repeat(6), "🧡".repeat(6), "🧡".repeat(4) + "🖤".repeat(2), "❤️‍🩹".repeat(6), "🖤".repeat(6)];

const hangman = {
  id: "hangman",
  seed() {
    const [category, word, hint] = pick(HANGMAN_WORDS);
    return {
      word, category, hint,
      revealed: Array(word.length).fill(false),
      guessed: [], lives: 6, hintsUsed: 0, status: "playing",
    };
  },
  mask(s) {
    return s.word
      .split("")
      .map((ch, i) => (s.revealed[i] ? ch : "_"))
      .join(" ");
  },
  intro(s) {
    return `🔤 Hangman! Category: ${s.category}. The word has ${s.word.length} letters:\n\n${this.mask(s)}\n\nGuess a letter — or type "hint" for help. You have 6 lives.`;
  },
  step(state, input) {
    if (state.status !== "playing") return { state, reply: "Round over — start Hangman again for a new word! 🔤" };
    const t = norm(input);
    if (t === "hint" || t === "clue") {
      if (state.hintsUsed >= 2) return { state, reply: `No more hints — you've got this! Still ${state.lives} ${state.lives === 1 ? "life" : "lives"}.\n\n${this.mask(state)}` };
      // reveal the most useful unrevealed letter
      const freq = {};
      for (let i = 0; i < state.word.length; i++) {
        if (!state.revealed[i]) freq[state.word[i]] = (freq[state.word[i]] || 0) + 1;
      }
      const best = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
      const revealed = state.word.split("").map((ch, i) => state.revealed[i] || ch === best);
      const hinted = { ...state, revealed, hintsUsed: state.hintsUsed + 1 };
      if (revealed.every(Boolean)) return this.finish(hinted);
      return { state: hinted, reply: `🫱 Psst — there's a "${best.toUpperCase()}" in it.\n\n${this.mask(hinted)}` };
    }
    const guess = firstWord(input);
    if (!/^[a-z]$/.test(guess)) {
      if (t.replace(/ /g, "").length > 1) {
        // full-word guess
        if (t === state.word) {
          const revealed = state.word.split("").map(() => true);
          return this.finish({ ...state, revealed });
        }
        return { state, reply: `"${input.trim().slice(0, 20)}" isn't the word — stick to one letter, or try "hint".\n\n${this.mask(state)}` };
      }
      return { state, reply: `One letter at a time (a–z), or type "hint" 🙂\n\n${this.mask(state)}` };
    }
    if (state.guessed.includes(guess)) {
      return { state, reply: `You already tried "${guess}"! 😄\n\n${this.mask(state)}` };
    }
    const guessed = [...state.guessed, guess];
    const revealed = state.word.split("").map((ch, i) => state.revealed[i] || ch === guess);
    if (revealed.every(Boolean)) return this.finish({ ...state, guessed, revealed });
    const hit = revealed.some((v, i) => v && !state.revealed[i]);
    if (hit) {
      return { state: { ...state, guessed, revealed }, reply: `✅ Yes! "${guess.toUpperCase()}" is in!\n\n${this.mask({ ...state, revealed })}  ${HANGMAN_STAGES[state.lives - 1]}` };
    }
    const lives = state.lives - 1;
    if (lives <= 0) {
      return {
        state: lost({ ...state, guessed, revealed: state.word.split("").map(() => true) }),
        reply: `💔 Out of lives! The word was "${state.word.toUpperCase()}".\n\n${HANGMAN_STAGES[5]}\n\nNew word?`,
      };
    }
    return {
      state: { ...state, guessed, lives },
      reply: `❌ No "${guess.toUpperCase()}". ${"🖤".repeat(6 - lives)}${HANGMAN_STAGES[lives - 1]}\n\n${this.mask(state)}`,
    };
  },
  finish(state) {
    return {
      state: won(state),
      reply: `🎉 ${state.word.toUpperCase()} — you got it with ${state.lives} ${state.lives === 1 ? "life" : "lives"} to spare! ${state.hintsUsed ? "(with a little hint 😉)" : "No hints needed!"} Another word?`,
    };
  },
  fallback(s) {
    return `The word-so-far: ${this.mask(s)} — guessing runs fully on my local engine, so keep going!`;
  },
};

// ---------- riddles ----------------------------------------------------------
const RIDDLES = [
  { q: "I have keys but no locks. I have space but no room. You can enter, but you can't go outside. What am I?", a: ["keyboard"], aliases: ["a keyboard", "computer keyboard"] },
  { q: "What has to be broken before you can use it?", a: ["egg"], aliases: ["an egg", "eggs"] },
  { q: "I'm tall when I'm young, and short when I'm old. What am I?", a: ["candle"], aliases: ["a candle", "pencil"] },
  { q: "What has hands but cannot clap?", a: ["clock"], aliases: ["a clock", "watch"] },
  { q: "What has a face and two hands but no arms or legs?", a: ["clock"], aliases: ["a clock", "watch"] },
  { q: "What gets wetter the more it dries?", a: ["towel"], aliases: ["a towel"] },
  { q: "What has one eye but cannot see?", a: ["needle"], aliases: ["a needle"] },
  { q: "I follow you all day but disappear in the dark. What am I?", a: ["shadow"], aliases: ["your shadow", "a shadow"] },
  { q: "What has a neck but no head?", a: ["bottle"], aliases: ["a bottle"] },
  { q: "What goes up but never comes down?", a: ["age"], aliases: ["your age"] },
  { q: "What building has the most stories?", a: ["library"], aliases: ["a library", "the library"] },
  { q: "What can travel around the world while staying in a corner?", a: ["stamp"], aliases: ["a stamp", "postage stamp"] },
  { q: "I have cities but no houses, forests but no trees, water but no fish. What am I?", a: ["map"], aliases: ["a map"] },
  { q: "What invention lets you look right through a wall?", a: ["window"], aliases: ["a window"] },
  { q: "What runs all around a backyard yet never moves?", a: ["fence"], aliases: ["a fence"] },
  { q: "What has words but never speaks?", a: ["book"], aliases: ["a book"] },
  { q: "Where does today come before yesterday?", a: ["dictionary"], aliases: ["a dictionary", "the dictionary"] },
  { q: "What is full of holes but still holds water?", a: ["sponge"], aliases: ["a sponge"] },
  { q: "What month has 28 days?", a: ["all"], aliases: ["all of them", "every month", "they all do"] },
  { q: "What can you catch but not throw?", a: ["cold"], aliases: ["a cold"] },
];

const riddles = {
  id: "riddles",
  seed() {
    const queue = shuffle(RIDDLES.map((_, i) => i));
    return { order: RIDDLES, queue, idx: 0, solved: 0, hinted: false, status: "playing" };
  },
  current(s) {
    return s.order[s.queue[s.idx]];
  },
  intro(s) {
    return `🧩 Riddle Run — ${s.queue.length} riddles! I say the riddle, you say the answer. First one:\n\n${this.current(s).q}`;
  },
  matches(r, input) {
    const t = norm(input);
    if (!t) return false;
    if (r.a.some((a) => t === norm(a))) return true;
    if (r.aliases?.some((a) => t === norm(a))) return true;
    // short answers: accept exact word contained in a very short reply
    return r.a.some((a) => norm(a).length <= 12 && t.length <= norm(a).length + 16 && t.includes(norm(a).replace(/^(a|an|the) /, "")));
  },
  step(state, input) {
    if (state.status !== "playing") return { state, reply: "Riddle run finished — start again for a fresh set! 🧩" };
    const t = norm(input);
    if (t === "skip" || t === "next") {
      const idx = state.idx + 1;
      if (idx >= state.queue.length) {
        return { state: won({ ...state, idx }, { score: state.solved }), reply: `🏁 That's the whole run! You solved ${state.solved}. Final score: ${state.solved} riddles. Play again anytime! 🧩` };
      }
      return { state: { ...state, idx, hinted: false }, reply: `⏭️ It was "${this.current(state).a[0]}". Next one:\n\n${this.current({ ...state, idx }).q}` };
    }
    if (t === "hint" || t === "clue") {
      if (state.hinted) return { state, reply: `I already told you — it starts with "${this.current(state).a[0][0].toUpperCase()}"! 🙂` };
      return { state: { ...state, hinted: true }, reply: `💡 It starts with "${this.current(state).a[0][0].toUpperCase()}" and it's ${this.current(state).a[0].length} letters long.` };
    }
    const r = this.current(state);
    if (this.matches(r, input)) {
      const solved = state.solved + 1;
      const idx = state.idx + 1;
      if (idx >= state.queue.length) {
        return { state: won({ ...state, idx, solved }, { score: solved }), reply: `✅ "${r.a[0]}" — right! That was the last one: ${solved}/${state.queue.length} solved. RIDDLE MASTER! 🏆` };
      }
      const next = this.current({ ...state, idx });
      return { state: { ...state, idx, solved, hinted: false }, reply: `✅ "${r.a[0]}" — correct! ${solved} solved so far. Next:\n\n${next.q}` };
    }
    return { state, reply: `🤔 Not quite — try again, or say "hint" / "skip".\n\n${r.q}` };
  },
  fallback(s) {
    return `Riddles run on my local brain: ${this.current(s).q}`;
  },
};

// ---------- twenty questions -------------------------------------------------
const TQ_SECRETS = [
  { name: "elephant", aliases: ["elephant", "an elephant"], hint: "It's gray and huge" },
  { name: "rainbow", aliases: ["rainbow", "a rainbow"], hint: "It appears after rain" },
  { name: "bicycle", aliases: ["bicycle", "a bicycle", "bike", "a bike"], hint: "Two wheels" },
  { name: "pizza", aliases: ["pizza", "a pizza"], hint: "You eat it in slices" },
  { name: "telescope", aliases: ["telescope", "a telescope"], hint: "Look up at night" },
  { name: "penguin", aliases: ["penguin", "a penguin"], hint: "It wears a tuxedo" },
  { name: "trampoline", aliases: ["trampoline", "a trampoline"], hint: "Bounce on it" },
  { name: "snowman", aliases: ["snowman", "a snowman"], hint: "Built in winter" },
  { name: "library", aliases: ["library", "a library", "the library"], hint: "Full of stories" },
  { name: "firetruck", aliases: ["firetruck", "fire truck", "a firetruck", "a fire truck"], hint: "It's red and loud" },
  { name: "guitar", aliases: ["guitar", "a guitar"], hint: "Six strings" },
  { name: "volcano", aliases: ["volcano", "a volcano"], hint: "It erupts" },
  { name: "astronaut", aliases: ["astronaut", "an astronaut"], hint: "Works in space" },
  { name: "jellyfish", aliases: ["jellyfish", "a jellyfish"], hint: "Wobbly and see-through" },
  { name: "kite", aliases: ["kite", "a kite"], hint: "Flies on a string" },
];

const twentyQuestions = {
  id: "twenty-questions",
  seed() {
    const s = pick(TQ_SECRETS);
    return { secret: s.name, aliases: s.aliases, hint: s.hint, questionsLeft: 20, asked: 0, status: "playing" };
  },
  intro: (s) => `🤔 Twenty Questions! I'm thinking of something — you have ${s.questionsLeft} yes/no questions. Ask away, or type "guess: ..." when you know!`,
  step(state, input) {
    if (state.status !== "playing") return { state, reply: "Round finished — start again to play a new secret! 🤔" };
    const t = norm(input);
    if (/^(give up|i give up|reveal|tell me|surrender)/.test(t)) {
      return { state: lost({ ...state }), reply: `✨ It was a ${state.secret.toUpperCase()}! ${state.hint}. Want to try another one?` };
    }
    // Explicit guesses only: "guess: an elephant". Ordinary questions (even
    // "is it …?") go to the oracle — treating them as guesses broke the game.
    const explicit = /^guess[:\s]+(.+)$/.exec(t);
    if (explicit) {
      const g = norm(explicit[1]);
      const hit = state.aliases.some((a) => g === norm(a)) || g === norm(state.secret) || g.includes(norm(state.secret));
      if (hit) {
        return { state: won({ ...state }, { score: 20 - state.questionsLeft }), reply: `🎉 YES — it was a ${state.secret.toUpperCase()}! You guessed it with ${state.questionsLeft} questions to spare! Play again?` };
      }
      return { state, reply: `❌ Not a ${explicit[1].trim().slice(0, 30)}! ${state.questionsLeft} questions left — keep asking!` };
    }
    // A question that names the secret IS a correct guess — settle it here so
    // wins work even fully offline without the oracle model.
    const namesSecret = state.aliases.some((a) => t.includes(norm(a))) || t.includes(norm(state.secret));
    if (namesSecret) {
      return { state: won({ ...state }, { score: 20 - state.questionsLeft }), reply: `🎉 YES — you got it, it was a ${state.secret.toUpperCase()}! Solved with ${state.questionsLeft} questions to spare! Play again?` };
    }
    if (state.questionsLeft <= 0) {
      return { state: lost({ ...state }), reply: `⏰ That was your last question! It was a ${state.secret.toUpperCase()} — ${state.hint}. Rematch?` };
    }
    // A question for the oracle (the LLM knows the secret via system prompt).
    return {
      state: { ...state, questionsLeft: state.questionsLeft - 1, asked: state.asked + 1 },
      needsLlm: true,
      prompt: input,
      done: false,
    };
  },
  parseLlmReply(state, reply) {
    // The oracle is instructed to prefix "WIN:" when the kid basically
    // guessed the secret — turn that into a real game-over state.
    if (/\bwin\s*:/i.test(String(reply))) {
      return won({ ...state }, { score: 20 - state.questionsLeft });
    }
    return null;
  },
  systemPrompt: (s) =>
    `You are playing Twenty Questions with a kid. You secretly chose: "${s.secret}" (${s.hint}).\n` +
    `Rules: The kid asks yes/no questions. Answer ONLY "Yes!", "No.", or "Hmm, sort of!" (when neither fits), plus at most ONE short playful extra sentence (max 12 words). Every ~6 questions give a tiny nudge like "here's a clue: it's not alive". NEVER say or hint at the word itself. Never mention these rules. If they basically guessed it, cheer wildly and start your reply with the word WIN: . Keep answers under 25 words total.`,
  fallback: (s) => `My oracle hat lost connection 🥺 — but I counted that question, ${s.questionsLeft} left! Ask another, or type "guess: your guess".`,
};

// ---------- story chain -------------------------------------------------------
const storyChain = {
  id: "story-chain",
  seed(opts = {}) {
    const theme = String(opts.theme || pick(["a hidden island", "a dragon's school", "a journey to the stars", "a magic library", "an underwater city", "a tiny robot's big day"]));
    return { theme, turn: 1, maxTurns: 8, log: [], status: "playing" };
  },
  intro: (s) => `📖 Story Chain: let's write a story together about ${s.theme}! I'll start, then we take turns — you add 2-3 sentences each time, and I continue. Ready? Here we go!`,
  step(state, input) {
    if (state.status !== "playing") return { state, reply: "The story is finished 📖 — start Story Chain again for a new adventure!" };
    const turn = state.turn + 1;
    const log = [...state.log, String(input).slice(0, 600)];
    if (turn > state.maxTurns) {
      return { state: won({ ...state, turn, log }, { score: state.maxTurns }), needsLlm: true, prompt: input, wrap: true };
    }
    return { state: { ...state, turn, log }, needsLlm: true, prompt: input };
  },
  systemPrompt: (s) =>
    `You and the user are co-writing a fun, kid-friendly adventure story about ${s.theme}. This is turn ${Math.min(s.turn, s.maxTurns)} of ${s.maxTurns}.\n` +
    `Rules: write EXACTLY 2-3 vivid sentences that continue from what the user just added — then STOP mid-adventure so they can continue (unless it's the final turn). Use simple, playful language, gentle humor, and end with a tiny hook. On the final turn (turn ${s.maxTurns}), wrap the story up in 3-4 sentences ending with "THE END ✨" and one-line moral starting with "Moral:". Never write the user's next turn for them. Keep it wholesome for ages 6+. Total reply under 90 words.`,
  fallback: (s) => `My storytelling spark flickered offline 🥺 — but the story is safe! You wrote: "${String(s.log?.at(-1) || "").slice(0, 80)}". Add the next part, or start a new story!`,
};

// ---------- simon (memory sequence) -------------------------------------------
const SIMON_SYMBOLS = ["🔴", "🟢", "🔵", "🟡"];

const simon = {
  id: "simon",
  seed() {
    return { seq: [1 + Math.floor(Math.random() * 4)], inputIdx: 0, round: 1, best: 0, status: "playing" };
  },
  show(s) {
    return s.seq.map((n) => SIMON_SYMBOLS[n - 1]).join(" ");
  },
  intro(s) {
    return `🧠 Simon Says — memory game! Repeat the pattern by typing ${SIMON_SYMBOLS.map((_, i) => i + 1).join(", ")} (${SIMON_SYMBOLS.join(", ")}).\n\nRound ${s.round} — watch closely: ${this.show(s)}\n\nNow type it back!`;
  },
  step(state, input) {
    if (state.status !== "playing") return { state, reply: "Round over — start again to beat your best! 🧠" };
    const n = Number(firstWord(input).replace(/[^0-9]/g, ""));
    if (!Number.isInteger(n) || n < 1 || n > 4) {
      return { state, reply: `Type 1-4 (🔴1 🟢2 🔵3 🟡4). The pattern: ${this.show(state)}` };
    }
    if (state.seq[state.inputIdx] !== n) {
      const best = Math.max(state.best, state.round - 1);
      return {
        state: lost({ ...state, best }),
        reply: `💥 Oops — I needed ${SIMON_SYMBOLS[state.seq[state.inputIdx] - 1]} there! You made it to round ${state.round}. Pattern was: ${this.show(state)}\n\nBest this game: ${state.best || state.round - 1} rounds. Again?`,
      };
    }
    if (state.inputIdx + 1 >= state.seq.length) {
      // round complete → grow
      const seq = [...state.seq, 1 + Math.floor(Math.random() * 4)];
      const round = state.round + 1;
      return {
        state: { ...state, seq, inputIdx: 0, round },
        reply: `✅ Perfect! Round ${round} — watch: ${seq.map((x) => SIMON_SYMBOLS[x - 1]).join(" ")}\n\nNow repeat it!`,
      };
    }
    return { state: { ...state, inputIdx: state.inputIdx + 1 }, reply: `✅ Keep going! (${state.inputIdx + 2}/${state.seq.length})` };
  },
  fallback(s) {
    return `Memory game runs locally: repeat ${this.show(s)}`;
  },
};

// ---------- registry ----------------------------------------------------------
// Human-facing metadata + the engine that powers each built-in game.
export const BUILTIN_GAMES = [
  { id: "guess-number", engine: "guess-number", name: "Guess My Number", emoji: "🔢", tagline: "Can you read Talia's mind in 7 tries?", category: "Numbers", ages: "6+", needsLlm: false, howTo: "Type a number; I say higher or lower." },
  { id: "quick-math", engine: "quick-math", name: "Quick Math", emoji: "🧮", tagline: "10 fast sums — streaks and stars", category: "Numbers", ages: "6+", needsLlm: false, howTo: "Type the answer to each sum. Pick level 1-3." },
  { id: "tictactoe", engine: "tictactoe", name: "Tic-Tac-Toe", emoji: "❌", tagline: "Classic 3-in-a-row vs Talia", category: "Board", ages: "5+", needsLlm: false, howTo: "Type a cell number 1-9 to place your X." },
  { id: "connect4", engine: "connect4", name: "Connect Four", emoji: "🔴", tagline: "Drop discs, make four in a row", category: "Board", ages: "6+", needsLlm: false, howTo: "Type a column 1-7 to drop your disc." },
  { id: "rps", engine: "rps", name: "Rock Paper Scissors", emoji: "✂️", tagline: "Best of 5 against a sneaky AI", category: "Reflex", ages: "5+", needsLlm: false, howTo: "Type rock, paper, or scissors." },
  { id: "hangman", engine: "hangman", name: "Hangman", emoji: "🔤", tagline: "Save the day one letter at a time", category: "Words", ages: "7+", needsLlm: false, howTo: "Guess letters; type \"hint\" for help." },
  { id: "riddles", engine: "riddles", name: "Riddle Run", emoji: "🧩", tagline: "20 classic riddles — how many can you solve?", category: "Words", ages: "7+", needsLlm: false, howTo: "Type your answer; say \"hint\" or \"skip\" anytime." },
  { id: "simon", engine: "simon", name: "Simon Memory", emoji: "🧠", tagline: "Watch the pattern, repeat it, level up", category: "Reflex", ages: "5+", needsLlm: false, howTo: "Type the colors back as numbers 1-4." },
  { id: "twenty-questions", engine: "twenty-questions", name: "Twenty Questions", emoji: "🤔", tagline: "Talia thinks of something — outsmart her", category: "Words", ages: "8+", needsLlm: true, howTo: "Ask yes/no questions; type \"guess: ...\" when ready." },
  { id: "story-chain", engine: "story-chain", name: "Story Chain", emoji: "📖", tagline: "Write an adventure together, turn by turn", category: "Story", ages: "6+", needsLlm: true, howTo: "Add 2-3 sentences each turn; Talia continues." },
  { id: "blockcraft", engine: "blockcraft", name: "Blockcraft", emoji: "🧱", tagline: "A tiny voxel world — mine, build, and let Talia architect it", category: "Build", ages: "5+", needsLlm: true, howTo: "Tap a block to dig it, tap the sky to build. Ask for `blueprint cosy cabin` and fill in Talia's design." },
  { id: "super-hop", engine: "mario", name: "Super Hop", emoji: "🍄", tagline: "Run, jump and stomp your way to the flag — six worlds to finish", category: "Arcade", ages: "5+", needsLlm: false, howTo: "Arrow keys or WASD to run, Space to jump. Pick any of the six levels under the canvas, or type `levels` in the chat. Or just type `go right` and `jump`." },
];

const byId = new Map(BUILTIN_GAMES.map((g) => [g.engine, g]));

export function getGame(id) {
  return BUILTIN_GAMES.find((g) => g.id === id) || null;
}

export function engineFor(gameDef, installed) {
  if (gameDef.builtin) return ENGINES[gameDef.engine] ?? null;
  return ENGINES[installed?.engine] ?? null;
}

export const ENGINES = {
  "guess-number": guessNumber,
  "quick-math": quickMath,
  tictactoe,
  connect4,
  rps,
  hangman,
  riddles,
  simon,
  "twenty-questions": twentyQuestions,
  "story-chain": storyChain,
  blockcraft,
  mario,
  quiz: null, // data-driven — created per pack (see makeQuizEngine)
  scramble: null, // data-driven — see makeScrambleEngine
  "llm-rounds": null, // data-driven — see makeLlmRoundsEngine
};

// ---------- data-driven pack engines ------------------------------------------
function makeQuizEngine(pack) {
  const qs = pack.data?.questions ?? [];
  return {
    id: `quiz:${pack.id}`,
    seed() {
      const queue = shuffle(qs.map((_, i) => i));
      return { queue, idx: 0, score: 0, answered: 0, status: "playing" };
    },
    cur: (s) => qs[s.queue[Math.min(s.idx, s.queue.length - 1)]],
    intro(s) {
      return `🎯 ${pack.name} — ${s.queue.length} questions! Answer with the letter (a/b/c) or just say it.\n\n1. ${this.cur(s).q}${this.cur(s).choices ? `\n${this.cur(s).choices.map((c, i) => "   " + "abcd"[i] + ") " + c).join("\n")}` : ""}`;
    },
    step(state, input) {
      if (state.status !== "playing") return { state, reply: "Quiz finished — play again for new questions! 🎯" };
      const q = this.cur(state);
      const t = norm(input);
      const letter = /^[a-d]$/.test(t) && q.choices ? q.choices[t.charCodeAt(0) - 97] : null;
      const guess = letter ? norm(letter) : t;
      const answers = [q.answer, ...(q.aliases ?? [])].map(norm);
      const ok = answers.some((a) => guess === a || (guess.length > 3 && answers.some((x) => x.includes(guess) && guess.includes(x))));
      const idx = state.idx + 1;
      const score = state.score + (ok ? 1 : 0);
      const fact = q.fact ? `\n\n💡 ${q.fact}` : "";
      if (idx >= state.queue.length) {
        const stars = score === state.queue.length ? " PERFECT SCORE! 🏆" : "";
        return { state: won({ ...state, idx, score, answered: idx }, { score }), reply: `${ok ? "✅ Correct!" : `❌ It was: ${q.answer}.`}${fact}\n\n🏁 Quiz complete: ${score}/${state.queue.length}.${stars}` };
      }
      const nq = qs[state.queue[idx]];
      return {
        state: { ...state, idx, score, answered: idx },
        reply: `${ok ? "✅ Correct!" : `❌ It was: ${q.answer}.`}${fact}\n\n${idx + 1}. ${nq.q}${nq.choices ? `\n${nq.choices.map((c, i) => "   " + "abcd"[i] + ") " + c).join("\n")}` : ""}`,
      };
    },
    fallback(s) {
      return `Quiz runs locally: ${this.cur(s).q}${this.cur(s).choices ? ` (${this.cur(s).choices.map((c, i) => "abcd"[i] + ") " + c).join(", ")})` : ""}`;
    },
  };
}

function makeScrambleEngine(pack) {
  const words = pack.data?.words ?? [];
  const scrambleWord = (w) => {
    let out = w;
    let guard = 0;
    while (out === w && guard++ < 8) {
      out = shuffle(w.split("")).join("");
    }
    return out;
  };
  return {
    id: `scramble:${pack.id}`,
    seed() {
      const queue = shuffle(words.map((_, i) => i));
      const w = words[queue[0]];
      return { queue, idx: 0, solved: 0, revealed: 0, scrambled: scrambleWord(w.word), status: "playing" };
    },
    cur: (s) => words[s.queue[Math.min(s.idx, s.queue.length - 1)]],
    intro: (s) => `🔀 ${pack.name} — unscramble the words! First up: ${s.scrambled.toUpperCase()}\n(${words.length} words — type "hint" if stuck)`,
    step(state, input) {
      if (state.status !== "playing") return { state, reply: "All done — start again for a new scramble set! 🔀" };
      const w = this.cur(state);
      const t = norm(input);
      if (t === "hint" || t === "clue") {
        if (state.revealed >= w.word.length - 1) return { state, reply: `Almost giving it away! The clue: ${w.hint}` };
        const revealed = state.revealed + 1;
        return { state: { ...state, revealed }, reply: `💡 Starts with "${w.word.slice(0, revealed).toUpperCase()}"… (${w.hint})\n\n${state.scrambled.toUpperCase()}` };
      }
      if (t === "skip" || t === "next") {
        const idx = state.idx + 1;
        if (idx >= state.queue.length) {
          return { state: won({ ...state, idx }, { score: state.solved }), reply: `🏁 It was "${w.word.toUpperCase()}". That's all ${state.queue.length}! You unscrambled ${state.solved}. 🎉` };
        }
        const nw = words[state.queue[idx]];
        return { state: { ...state, idx, revealed: 0, scrambled: scrambleWord(nw.word) }, reply: `⏭️ It was "${w.word.toUpperCase()}". Next: ${state.scrambled.toUpperCase()}` };
      }
      if (t === norm(w.word)) {
        const solved = state.solved + 1;
        const idx = state.idx + 1;
        if (idx >= state.queue.length) {
          return { state: won({ ...state, idx, solved }, { score: solved }), reply: `✅ "${w.word.toUpperCase()}" — and that was the last one! ${solved}/${state.queue.length} solved. WORD WIZARD! 🧙` };
        }
        const nw = words[state.queue[idx]];
        return { state: { ...state, idx, solved, revealed: 0, scrambled: scrambleWord(nw.word) }, reply: `✅ "${w.word.toUpperCase()}" — ${solved} solved! Next: ${state.scrambled.toUpperCase()}` };
      }
      return { state, reply: `🤔 Not that — try again! (${w.hint})\n\n${state.scrambled.toUpperCase()}` };
    },
    fallback: (s) => `Scramble is local: ${s.scrambled.toUpperCase()} — what's the word?`,
  };
}

function makeLlmRoundsEngine(pack) {
  const maxRounds = Math.min(20, Math.max(2, Number(pack.data?.maxRounds) || 8));
  return {
    id: `llm-rounds:${pack.id}`,
    seed() {
      return { round: 1, maxRounds, status: "playing" };
    },
    intro: (s) => `${pack.emoji} ${pack.name} — ${pack.data?.intro || "let's play!"}`,
    step(state, input) {
      const round = state.round + 1;
      if (round > maxRounds) {
        return { state: won({ ...state, round }, { score: maxRounds }), needsLlm: true, prompt: input, wrap: true };
      }
      return { state: { ...state, round }, needsLlm: true, prompt: input };
    },
    systemPrompt: (s, p) =>
      String(p.data?.system || "You are a playful game host for kids. Keep replies short, kind and fun.")
        .replace("{{round}}", String(Math.min(s.round, s.maxRounds)))
        .replace("{{maxRounds}}", String(s.maxRounds)),
    fallback: (s, p) => `I lost my game-host voice for a moment 🥺 — but ${p.name} keeps going: it's round ${s.round} of ${s.maxRounds}. Your turn!`,
  };
}

// ---------- installed catalogue packs -----------------------------------------
const PACK_ENGINES = { quiz: makeQuizEngine, scramble: makeScrambleEngine, "llm-rounds": makeLlmRoundsEngine };

export function packEngine(packDef) {
  const make = PACK_ENGINES[packDef.engine];
  return make ? make(packDef) : null;
}

/** Validate an untrusted pack before install — packs are data, never code. */
export function validatePack(pack) {
  const errors = [];
  const engine = String(pack?.engine || "");
  if (!PACK_ENGINES[engine]) errors.push(`unknown engine "${engine}"`);
  if (!pack?.id || !/^[a-z0-9-]{2,48}$/.test(String(pack.id))) errors.push("id must be 2-48 chars of a-z 0-9 -");
  if (!pack?.name || String(pack.name).length > 60) errors.push("name required (max 60 chars)");
  const data = pack?.data;
  if (!data || typeof data !== "object") {
    errors.push("data object required");
  } else if (engine === "quiz") {
    if (!Array.isArray(data.questions) || data.questions.length < 3) errors.push("quiz needs 3+ questions");
    if ((data.questions?.length ?? 0) > 200) errors.push("quiz max 200 questions");
    for (const q of data.questions ?? []) {
      if (typeof q?.q !== "string" || !q.q.trim() || q.q.length > 400) errors.push("bad question text");
      if (typeof q?.answer !== "string" || !q.answer.trim() || q.answer.length > 120) errors.push("bad answer");
      if (q.choices && (!Array.isArray(q.choices) || q.choices.length > 6 || q.choices.some((c) => typeof c !== "string" || c.length > 120))) errors.push("bad choices");
      if (q.fact && (typeof q.fact !== "string" || q.fact.length > 400)) errors.push("bad fact");
    }
  } else if (engine === "scramble") {
    if (!Array.isArray(data.words) || data.words.length < 3) errors.push("scramble needs 3+ words");
    if ((data.words?.length ?? 0) > 300) errors.push("scramble max 300 words");
    for (const w of data.words ?? []) {
      if (typeof w?.word !== "string" || !/^[a-zA-Z]{3,18}$/.test(w.word)) errors.push(`bad word "${w?.word}"`);
      if (typeof w?.hint !== "string" || w.hint.length > 120) errors.push("bad hint");
    }
  } else if (engine === "llm-rounds") {
    if (typeof data.system !== "string" || data.system.length < 20 || data.system.length > 4000) errors.push("llm-rounds needs system prompt (20-4000 chars)");
  }
  return errors;
}

export async function listInstalledPacks() {
  return readCollection("games", []);
}

export async function installPack(id) {
  const entry = CATALOGUE.find((c) => c.id === id);
  if (!entry) return { ok: false, error: "Not in the catalogue." };
  const pack = { ...entry, installedAt: Date.now(), builtin: false, installed: true };
  const errors = validatePack(pack);
  if (errors.length) return { ok: false, error: `Pack failed safety check: ${errors[0]}` };
  const installed = await listInstalledPacks();
  const next = [...installed.filter((p) => p.id !== id), pack];
  writeCollection("games", next.slice(0, 100));
  return { ok: true, pack };
}

export async function uninstallPack(id) {
  const installed = await listInstalledPacks();
  const next = installed.filter((p) => p.id !== id);
  writeCollection("games", next);
  return next.length !== installed.length;
}

/** All playable games = built-ins + installed packs (with live engine bound). */
export async function listGames() {
  const packs = await listInstalledPacks();
  const builtin = BUILTIN_GAMES.map((g) => ({ ...g, installed: true, source: "builtin" }));
  const installedPacks = packs.map((p) => ({
    id: p.id,
    engine: p.engine,
    name: p.name,
    emoji: p.emoji || "🎮",
    tagline: p.tagline || "",
    category: p.category || "Pack",
    ages: p.ages || "6+",
    needsLlm: p.engine === "llm-rounds",
    howTo: p.howTo || "Play along in chat!",
    builtin: false,
    installed: true,
    source: "pack",
  }));
  return [...builtin, ...installedPacks];
}

/** Full game record for play: metadata + engine + (for packs) pack data. */
export async function getPlayableGame(id) {
  const builtin = getGame(id);
  if (builtin) {
    return { ...builtin, engineImpl: ENGINES[builtin.engine] ?? null };
  }
  const packs = await listInstalledPacks();
  const pack = packs.find((p) => p.id === id);
  if (pack) return { ...pack, engineImpl: packEngine(pack) };
  return null;
}

// ---------- live game sessions (in-memory, TTL, LRU-capped) ------------------
const sessions = new Map();
const SESSION_TTL = 3 * 60 * 60 * 1000; // 3h idle
const MAX_SESSIONS = 300;

export function startGameSession({ gameId, chatId, game, state }) {
  const id = `gs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const session = {
    id,
    gameId,
    chatId: chatId || null,
    game: { id: game.id, name: game.name, emoji: game.emoji || "🎮", needsLlm: !!game.needsLlm, data: game.data ?? null },
    engine: game.engineImpl,
    state,
    history: [],
    createdAt: Date.now(),
    lastUsed: Date.now(),
    touch() {
      this.lastUsed = Date.now();
    },
  };
  sessions.set(id, session);
  sweepSessions();
  return session;
}

export function getGameSession(id) {
  const s = sessions.get(id);
  if (s) s.touch();
  return s ?? null;
}

export function endGameSession(id) {
  return sessions.delete(id);
}

function sweepSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastUsed > SESSION_TTL) sessions.delete(id);
  }
  while (sessions.size > MAX_SESSIONS) {
    let oldest = null;
    let oldestAt = Infinity;
    for (const [id, s] of sessions) {
      if (s.lastUsed < oldestAt) {
        oldestAt = s.lastUsed;
        oldest = id;
      }
    }
    if (!oldest) break;
    sessions.delete(oldest);
  }
}

// ---------- client-safe state -------------------------------------------------
// The HUD never sees hidden fields (the secret word/number, quiz answers…).
const SECRET_STATE_KEYS = new Set(["secret", "word", "aliases", "answer", "answers", "hint"]);

export function sanitizeGameState(st) {
  if (Array.isArray(st)) return st.map(sanitizeGameState);
  if (st && typeof st === "object") {
    const out = {};
    for (const [k, v] of Object.entries(st)) {
      if (!SECRET_STATE_KEYS.has(k)) out[k] = sanitizeGameState(v);
    }
    return out;
  }
  return st;
}
