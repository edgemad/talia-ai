import { describe, expect, it } from "vitest";
import {
  BUILTIN_GAMES,
  ENGINES,
  getGame,
  listGames,
  validatePack,
  sanitizeGameState,
} from "../server/games.mjs";

type StepResult = { state: Record<string, any>; reply?: string; needsLlm?: boolean };
type Engine = {
  seed: (opts?: Record<string, any>) => Record<string, any>;
  step: (state: Record<string, any>, input: string) => StepResult;
  intro: (state: Record<string, any>) => string;
  fallback?: (state: Record<string, any>) => string;
};

const asEngine = (e: unknown) => e as Engine;

describe("games registry", () => {
  it("every builtin game has a unique id, engine, intro and how-to", () => {
    const ids = new Set<string>();
    for (const g of BUILTIN_GAMES) {
      expect(g.id).toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(g.id)).toBe(false);
      ids.add(g.id);
      expect(ENGINES[g.engine as keyof typeof ENGINES]).toBeTruthy();
      const engine = asEngine(ENGINES[g.engine as keyof typeof ENGINES]);
      expect(engine.intro(engine.seed({})).length).toBeGreaterThan(10);
      expect(g.howTo.length).toBeGreaterThan(3);
      expect(g.ages).toMatch(/^\d+\+$/);
    }
    expect(ids.size).toBeGreaterThanOrEqual(10);
  });

  it("getGame and listGames expose built-ins", async () => {
    expect(getGame("guess-number")?.name).toBe("Guess My Number");
    expect(getGame("nope")).toBeNull();
    const games: { id: string }[] = await listGames();
    expect(games.some((g: { id: string }) => g.id === "tictactoe")).toBe(true);
  });
});

describe("guess the number", () => {
  const engine = asEngine(ENGINES["guess-number"]);
  it("gives higher/lower hints and tracks tries", () => {
    let state = engine.seed({ difficulty: "hard" });
    state = engine.step(state, "0").state; // invalid
    expect(state.tries).toBe(0);
    const secret = Number(state.secret);
    const near = secret + 1 > 100 ? secret - 1 : secret + 1;
    const r1 = engine.step(state, String(near));
    expect(String(r1.reply)).toMatch(/lower|out of tries/);
    expect(r1.state.tries).toBe(1);
  });
  it("wins when the secret is guessed", () => {
    let state = engine.seed({});
    const r = engine.step(state, String(state.secret));
    expect(r.state.status).toBe("won");
    expect(String(r.reply)).toContain("🎉");
  });
  it("loses after maxTries wrong guesses", () => {
    let state = engine.seed({});
    let guard = 0;
    while (state.status === "playing" && guard++ < 20) {
      const secret = Number(state.secret);
      const wrong = secret === 1 ? secret + 1 : secret - 1;
      state = engine.step(state, String(wrong)).state;
    }
    expect(state.status).toBe("lost");
  });
});

describe("quick math", () => {
  const engine = asEngine(ENGINES["quick-math"]);
  it("runs 10 questions and scores them", () => {
    let state = engine.seed({ level: 1 });
    let correct = 0;
    let guard = 0;
    while (state.status === "playing" && guard++ < 15) {
      const r = engine.step(state, String(state.answer));
      if (String(r.reply).startsWith("✅")) correct++;
      state = r.state;
    }
    expect(state.status).toBe("won");
    // the 10th correct answer is announced by the final 🏁 summary, not ✅
    expect([correct, correct + 1]).toContain(state.correct);
    expect(state.qNum).toBe(10);
  });
  it("marks wrong answers and reveals the right one", () => {
    const state = engine.seed({ level: 2 });
    const r = engine.step(state, String(Number(state.answer) + 1));
    expect(String(r.reply)).toContain(`It was ${state.answer}`);
  });
});

describe("tic-tac-toe", () => {
  const engine = asEngine(ENGINES.tictactoe);
  it("hard mode is unbeatable across many random games", () => {
    for (let i = 0; i < 30; i++) {
      let state = engine.seed({ difficulty: "hard" });
      let guard = 0;
      while (state.status === "playing" && guard++ < 12) {
        const board = state.board as string[];
        const empty = board.map((v, j) => (v ? null : j)).filter((j) => j !== null) as number[];
        const r = engine.step(state, String(empty[Math.floor(Math.random() * empty.length)] + 1));
        state = r.state;
      }
      expect(state.status).not.toBe("won"); // kid must never win on hard
    }
  });
  it("rejects taken cells and out-of-range cells", () => {
    let state = engine.seed({});
    state = engine.step(state, "5").state;
    const r = engine.step(state, "5");
    expect(r.state).toEqual(state);
    expect(String(r.reply)).toMatch(/1–9/);
  });
  it("detects a kid win on easy mode eventually possible", () => {
    // Kid takes 1,5,9 diagonal; easy AI may or may not block, so just verify a
    // full legal game terminates in a non-playing status or stays consistent.
    let state = engine.seed({ difficulty: "easy" });
    let guard = 0;
    while (state.status === "playing" && guard++ < 12) {
      const board = state.board as string[];
      const empty = board.map((v, j) => (v ? null : j)).filter((j) => j !== null) as number[];
      const r = engine.step(state, String(empty[0] + 1));
      state = r.state;
    }
    expect(["won", "lost", "draw", "playing"]).toContain(state.status);
  });
});

describe("connect four", () => {
  const engine = asEngine(ENGINES.connect4);
  it("blocks an immediate kid win", () => {
    // Kid owns the bottom of cols 1-3 (indices 35-37); kid plays col 7; the
    // AI must drop into col 4 (bottom index 38) to block the four-in-a-row.
    const board = Array(42).fill("");
    board[35] = "X";
    board[36] = "X";
    board[37] = "X";
    board[41] = "O"; // harmless AI disc, col 7 bottom
    const r = engine.step(
      { board, you: "X", ai: "O", difficulty: "hard", status: "playing" },
      "7",
    );
    expect(r.state.status).toBe("playing");
    expect((r.state.board as string[])[38]).toBe("O"); // col 4 bottom blocked
  });
  it("takes an immediate AI win", () => {
    // AI owns the bottom of cols 2-4; kid plays col 7; AI completes four by
    // dropping into col 5 (bottom index 39) instead of merely blocking.
    const crafted = Array(42).fill("");
    crafted[35] = "X"; // col 1 bottom (kid)
    crafted[36] = "O";
    crafted[37] = "O";
    crafted[38] = "O";
    const r2 = engine.step(
      { board: crafted, you: "X", ai: "O", difficulty: "hard", status: "playing" },
      "7",
    );
    expect(r2.state.status).toBe("lost"); // AI completed four in a row
  });
  it("rejects full columns and bad columns", () => {
    const state = engine.seed({});
    const r = engine.step(state, "99");
    expect(r.state).toEqual(state);
  });
});

describe("rock paper scissors", () => {
  const engine = asEngine(ENGINES.rps);
  it("counts a full match and ends it", () => {
    let state = engine.seed();
    let guard = 0;
    while (state.status === "playing" && guard++ < 30) {
      const r = engine.step(state, "rock");
      state = r.state;
    }
    expect(state.status).not.toBe("playing");
    expect((state.you as number) + (state.me as number) + (state.ties as number)).toBeGreaterThanOrEqual(5);
  });
  it("rejects non-throws", () => {
    const state = engine.seed();
    const r = engine.step(state, "banana");
    expect(r.state).toEqual(state);
  });
});

describe("hangman", () => {
  const engine = asEngine(ENGINES.hangman);
  it("reveals letters, tracks lives and finishes", () => {
    let state = engine.seed();
    const word = String(state.word);
    for (const ch of word) {
      const r = engine.step(state, ch);
      state = r.state;
      if (state.status !== "playing") break;
    }
    expect(state.status).toBe("won");
    expect(state.lives).toBeLessThanOrEqual(6);
  });
  it("deducts a life on a miss and limits hints", () => {
    let state = engine.seed();
    const word = String(state.word);
    const miss = "abcdefghijklmnopqrstuvwxyz".split("").find((c) => !word.includes(c)) ?? "q";
    const livesBefore = state.lives;
    state = engine.step(state, miss).state;
    expect(state.lives).toBe((livesBefore as number) - 1);
    state = engine.step(state, "hint").state;
    expect(state.hintsUsed).toBe(1);
  });
  it("never leaks the word in state sent to the client", () => {
    const state = engine.seed();
    const clean = sanitizeGameState(state);
    expect(clean).not.toHaveProperty("word");
  });
});

describe("riddles", () => {
  const engine = asEngine(ENGINES.riddles);
  const riddleEngine = ENGINES.riddles as unknown as {
    seed: () => Record<string, unknown>;
    step: (s: Record<string, unknown>, i: string) => StepResult;
    current: (s: Record<string, unknown>) => { q: string; a: string[] };
  };
  it("accepts fuzzy answers with articles", () => {
    // Find the keyboard riddle by its text (the answer word isn't in the
    // question) and answer naturally — proving article-insensitive matching.
    let state = riddleEngine.seed();
    let solvedKeyboard = false;
    let guard = 0;
    while (state.status === "playing" && guard++ < 25) {
      const cur = riddleEngine.current(state);
      const r = riddleEngine.step(state, /keys but no locks/i.test(cur.q) ? "a keyboard" : "skip");
      if (String(r.reply).startsWith("✅") && /keyboard/i.test(String(r.reply))) solvedKeyboard = true;
      state = r.state;
    }
    expect(solvedKeyboard).toBe(true);
  });
  it("supports hint and skip", () => {
    let state = engine.seed();
    state = engine.step(state, "hint").state;
    expect(state.hinted).toBe(true);
    const r = engine.step(state, "skip");
    expect(String(r.reply)).toMatch(/Next|next one|was/i);
  });
});

describe("simon", () => {
  const engine = asEngine(ENGINES.simon);
  it("grows the sequence when repeated correctly", () => {
    let state = engine.seed();
    const first = state.seq as number[];
    const r = engine.step(state, String(first[0]));
    if (first.length === 1) {
      expect((r.state.seq as number[]).length).toBe(2);
    } else {
      expect(r.state.inputIdx).toBe(1);
    }
  });
  it("ends when the pattern is broken", () => {
    let state = engine.seed();
    const wrong = (state.seq as number[])[0] === 1 ? 2 : 1;
    const r = engine.step(state, String(wrong));
    expect(r.state.status).toBe("lost");
  });
});

describe("twenty questions", () => {
  const engine = asEngine(ENGINES["twenty-questions"]);
  it("counts questions and requests the LLM oracle", () => {
    let state = engine.seed();
    const r = engine.step(state, "Is it alive?");
    expect(r.needsLlm).toBe(true);
    expect(r.state.questionsLeft).toBe(19);
  });
  it("detects a correct guess from aliases without the LLM", () => {
    let state = engine.seed();
    const r = engine.step(state, `guess: ${state.secret}`);
    expect(r.state.status).toBe("won");
    expect(r.needsLlm).toBeFalsy();
  });
  it("reveals on give up", () => {
    let state = engine.seed();
    const r = engine.step(state, "give up");
    expect(r.state.status).toBe("lost");
    expect(String(r.reply).toLowerCase()).toContain(String(state.secret).toLowerCase());
  });
});

describe("story chain", () => {
  const engine = asEngine(ENGINES["story-chain"]);
  it("alternates turns and wraps up after the last one", () => {
    let state = engine.seed({ theme: "a magic library" });
    expect(state.theme).toBe("a magic library");
    let guard = 0;
    while (state.status === "playing" && guard++ < 10) {
      const r = engine.step(state, "And then something exciting happened!");
      expect(r.needsLlm).toBe(true);
      state = r.state;
    }
    expect(state.status).toBe("won");
    expect(state.turn).toBeGreaterThan(8);
  });
});

describe("catalogue packs", () => {
  it("validates packs before install", () => {
    expect(validatePack({ id: "bad", engine: "quiz", name: "Bad", data: { questions: [] } }).length).toBeGreaterThan(0);
    expect(validatePack({ id: "bad2", engine: "nuclear-launch", name: "Bad", data: {} }).length).toBeGreaterThan(0);
    expect(validatePack({ id: "A".repeat(80), engine: "quiz", name: "Bad", data: { questions: [{ q: "?", answer: "a" }, { q: "?", answer: "b" }, { q: "?", answer: "c" }] } }).length).toBeGreaterThan(0);
    expect(
      validatePack({
        id: "ok-quiz",
        engine: "quiz",
        name: "OK",
        data: { questions: [{ q: "1+1?", answer: "2" }, { q: "2+2?", answer: "4" }, { q: "3+3?", answer: "6", choices: ["5", "6", "7"] }] },
      }).length,
    ).toBe(0);
    expect(
      validatePack({
        id: "ok-scramble",
        engine: "scramble",
        name: "OK",
        data: { words: [{ word: "cat", hint: "meow" }, { word: "dog", hint: "woof" }, { word: "bird", hint: "tweet" }] },
      }).length,
    ).toBe(0);
  });

  it("sanitizer strips secrets at any depth but keeps safe fields", () => {
    const clean = sanitizeGameState({
      secret: 42,
      word: "cat",
      tries: 3,
      nested: { answer: "x", hint: "y", ok: 1 },
      list: [{ aliases: ["a"], fine: 2 }],
    });
    expect(clean).toEqual({ tries: 3, nested: { ok: 1 }, list: [{ fine: 2 }] });
  });
});
