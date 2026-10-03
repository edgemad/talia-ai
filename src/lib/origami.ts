// Paper folding for kids — the content behind the folding section.
//
// Everything here is plain data plus a few pure lookups, so the instructions
// can be checked by tests rather than by squinting at the UI. The diagrams are
// described in a 100x100 box with y pointing down, which is the same space the
// canvas draws in, so `FoldDiagram` never has to do arithmetic.
//
// Two rules shaped this file:
//   1. Every fold must work with one square of paper and nothing else — no
//      glue, no scissors, no special paper. A five-year-old has a sheet of
//      printer paper and two hands.
//   2. Instructions are short and physical ("fold the corner to the centre"),
//      because that is the vocabulary a child already has. No origami jargon
//      without a plain-word gloss next to it.

/** A point in the diagram's 100x100 box. */
export type Pt = readonly [number, number];

/** What kind of crease to make. `valley` folds toward you, `mountain` away. */
export type CreaseKind = "valley" | "mountain" | "plain";

/**
 * One step's picture.
 *
 * `outline` is the paper as it looks *before* this step. `creases` are the
 * lines to fold along. `flap` is the piece that actually moves, shaded, with
 * an arrow to where it ends up — drawing the moving part is the difference
 * between a diagram a child can follow and one they can't.
 */
export interface Figure {
  outline: readonly Pt[];
  creases?: readonly { a: Pt; b: Pt; kind?: CreaseKind }[];
  flap?: { points: readonly Pt[]; to: Pt };
  arrow?: { from: Pt; to: Pt };
  /** Little numbered call-outs, e.g. "open here". */
  notes?: readonly { at: Pt; text: string }[];
}

export interface FoldStep {
  /** One short instruction. Imperative, one idea. */
  text: string;
  /** Optional "watch out" — the thing that trips people up. */
  tip?: string;
  /**
   * Set when this step is really "go and make that other thing first". It draws
   * no fold of its own, so the reader shows it as a link instead of a step.
   */
  ref?: string;
  figure: Figure;
}

export type Difficulty = "easy" | "medium" | "hard";

export interface Foldable {
  id: string;
  name: string;
  emoji: string;
  /** One line: what it is and why it's fun. */
  blurb: string;
  difficulty: Difficulty;
  /** Rough minutes for a small human. */
  minutes: number;
  /** Paper size that works best. */
  paper: string;
  steps: readonly FoldStep[];
}

export interface Hack {
  id: string;
  title: string;
  emoji: string;
  /** The trick, in plain words. */
  body: string;
  /** Why it matters — kids engage far more when they know the why. */
  why: string;
}

// ---------------------------------------------------------------------------
// Figure builders — these keep the step data readable instead of a wall of
// coordinate tuples.
// ---------------------------------------------------------------------------

const SQ: readonly Pt[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];

/** The flat square, and nothing else. */
const square = (): Figure => ({ outline: SQ });

/** A square with one crease and a flap folding onto it. */
const foldSquare = (creases: NonNullable<Figure["creases"]>, flap: NonNullable<Figure["flap"]>): Figure => ({
  outline: SQ,
  creases,
  flap,
});

/** Half-folded: a triangle sitting in the top-left of the box. */
const TRI: readonly Pt[] = [
  [0, 0],
  [100, 0],
  [0, 100],
];

/** The classic "fold the corner down to the centre line" move. */
const cornerToCentre = (side: "left" | "right" = "left"): Figure => {
  const flap: Figure["flap"] =
    side === "left"
      ? { points: [[0, 0], [50, 0], [0, 50]], to: [25, 50] }
      : { points: [[100, 0], [50, 0], [100, 50]], to: [75, 50] };
  return {
    outline: SQ,
    creases: [{ a: [50, 0], b: [0, 50], kind: "valley" }],
    flap,
  };
};

const creaseOnly = (a: Pt, b: Pt, kind: CreaseKind = "plain"): Figure => ({
  outline: SQ,
  creases: [{ a, b, kind }],
  notes: [{ at: [50, 92], text: "crease and unfold" }],
});

/** Turn the paper over. */
const flip = (outline: readonly Pt[] = SQ): Figure => ({
  outline,
  arrow: { from: [20, 80], to: [20, 20] },
  notes: [{ at: [50, 90], text: "flip over" }],
});

/** Squash: two arrows pressing a flap flat. */
const squash = (): Figure => ({
  outline: TRI,
  creases: [{ a: [0, 0], b: [0, 100], kind: "valley" }],
  arrow: { from: [70, 20], to: [45, 20] },
  notes: [{ at: [50, 90], text: "squash it flat" }],
});

/** A finished thing — no crease, just "look what you made". */
const done = (outline: readonly Pt[]): Figure => ({
  outline,
  notes: [{ at: [50, 92], text: "ta-da!" }],
});

// ---------------------------------------------------------------------------
// Bases — the shapes everything else is folded from.
// ---------------------------------------------------------------------------

export const BASES: readonly Foldable[] = [
  {
    id: "square-base",
    name: "Square Base",
    emoji: "🔷",
    blurb: "The starting point for half of all origami. Flat, with four flaps.",
    difficulty: "easy",
    minutes: 5,
    paper: "One square — any size",
    steps: [
      { text: "Start with the paper face down, and fold it in half the long way.", figure: creaseOnly([50, 0], [50, 100]) },
      { text: "Fold it in half the other way and unfold both times.", figure: creaseOnly([0, 50], [100, 50]) },
      {
        text: "Turn it over so the creases are bumps, not dents. Fold the bottom corner up to the top corner.",
        figure: foldSquare([{ a: [0, 100], b: [100, 100], kind: "valley" }], { points: [[0, 100], [100, 100], [50, 50]], to: [50, 10] }),
      },
      {
        text: "Fold the left corner in to meet that top corner.",
        figure: { outline: TRI, creases: [{ a: [0, 100], b: [50, 0], kind: "valley" }], flap: { points: [[0, 100], [0, 0], [50, 0]], to: [50, 5] } },
      },
      {
        text: "Fold the right corner in to meet that top point too. You should have a triangle sitting on the paper.",
        figure: { outline: TRI, creases: [{ a: [100, 100], b: [50, 0], kind: "valley" }], flap: { points: [[100, 100], [0, 0], [50, 0]], to: [45, 5] } },
        tip: "Keep every corner meeting the same top point, or it goes lumpy.",
      },
      {
        text: "Lift the bottom flap straight up and let it open, then squash it flat into a square.",
        figure: squash(),
        tip: "This is the tricky one. Push the sides in while lifting — it folds into a square all by itself.",
      },
      { text: "Turn it over and squash the back the same way.", figure: flip([[0, 0], [100, 0], [50, 100]]) },
      { text: "Done! Four flaps, one pocket. Most animals start here.", figure: done(SQ), tip: "Hold it by one flap and gently open the other three." },
    ],
  },
  {
    id: "preliminary-base",
    name: "Preliminary Base",
    emoji: "🔻",
    blurb: "A taller base with a point at the bottom. Cranes, boats and birds live here.",
    difficulty: "medium",
    minutes: 7,
    paper: "One square",
    steps: [
      { text: "Make a Square Base first.", figure: square(), ref: "square-base", tip: "Square Base is the two steps before this one." },
      {
        text: "Fold the front flap's bottom edge up so it lines up with the side, and do the same to the back.",
        figure: { outline: TRI, creases: [{ a: [0, 100], b: [50, 0], kind: "valley" }], flap: { points: [[0, 100], [50, 0], [0, 0]], to: [25, 25] } },
      },
      {
        text: "Fold the left and right corners of the top flap in toward the middle.",
        figure: { outline: TRI, creases: [{ a: [25, 0], b: [50, 40], kind: "valley" }, { a: [75, 0], b: [50, 40], kind: "valley" }], flap: { points: [[25, 0], [50, 40], [0, 0]], to: [50, 30] } },
      },
      {
        text: "Fold that flap's very top point down to the bottom point.",
        figure: { outline: TRI, creases: [{ a: [50, 0], b: [50, 100], kind: "valley" }], flap: { points: [[50, 0], [50, 40], [25, 20]], to: [50, 90] } },
      },
      { text: "Turn it over and repeat those two folds on the back.", figure: flip(TRI) },
      {
        text: "Petal-fold both sides: lift the flap, pinch the sides together and fold the tip up.",
        figure: { outline: TRI, creases: [{ a: [0, 100], b: [100, 100], kind: "valley" }], flap: { points: [[0, 100], [50, 0], [100, 100]], to: [50, 60] } },
        tip: "The petal fold is the magic move here — sides crease inward, then the whole point flips up.",
      },
      { text: "Fold the very bottom point up to tuck it in.", figure: creaseOnly([50, 100], [50, 60], "valley") },
      { text: "Done — a long point with a pocket on each side.", figure: done(TRI) },
    ],
  },
  {
    id: "bird-base",
    name: "Bird Base",
    emoji: "🕊️",
    blurb: "Four long points with two on top. The crane and the bird all come from here.",
    difficulty: "hard",
    minutes: 12,
    paper: "One square, or a bird-base printout",
    steps: [
      { text: "Make a Preliminary Base first.", figure: square(), ref: "preliminary-base" },
      {
        text: "Fold the bottom point up, crease it, and unfold.",
        figure: creaseOnly([50, 100], [50, 55], "plain"),
      },
      {
        text: "Open the top layers and squash them down along that crease.",
        figure: squash(),
        tip: "It looks wrong right up until it suddenly looks right.",
      },
      {
        text: "Turn over and squash the other side the same way.",
        figure: flip(TRI),
      },
      {
        text: "Petal-fold both points to the top so they sit side by side.",
        figure: { outline: TRI, creases: [{ a: [0, 100], b: [100, 100], kind: "valley" }], flap: { points: [[0, 100], [50, 0], [100, 100]], to: [50, 45] } },
      },
      {
        text: "Petal-fold the two points that now stick out to the bottom.",
        figure: { outline: TRI, creases: [{ a: [20, 40], b: [80, 40], kind: "valley" }], flap: { points: [[0, 100], [50, 0], [100, 100]], to: [50, 80] } },
        tip: "Fold one side, flip over, fold the other. They should match.",
      },
      { text: "Done — two long wings, a neck and a tail.", figure: done(TRI) },
    ],
  },
  {
    id: "frog-base",
    name: "Frog Base",
    emoji: "🐸",
    blurb: "Wide and squat with four corners. Frogs, flowers and the jumping things.",
    difficulty: "medium",
    minutes: 9,
    paper: "One square",
    steps: [
      { text: "Make a Square Base first.", figure: square(), ref: "square-base" },
      {
        text: "Fold the front flap's bottom corner up to the top, then unfold.",
        figure: creaseOnly([0, 100], [50, 50], "plain"),
      },
      {
        text: "Petal-fold that corner up.",
        figure: { outline: TRI, creases: [{ a: [0, 100], b: [50, 50], kind: "valley" }], flap: { points: [[0, 100], [50, 0], [100, 100]], to: [50, 35] } },
      },
      { text: "Turn it over and petal-fold the back corner too.", figure: flip(TRI) },
      {
        text: "Fold the two long points into the middle.",
        figure: { outline: TRI, creases: [{ a: [0, 100], b: [50, 50], kind: "valley" }], flap: { points: [[0, 100], [50, 0], [0, 0]], to: [50, 60] } },
      },
      { text: "Fold the bottom point up to the top to finish.", figure: creaseOnly([50, 100], [50, 40], "valley") },
      { text: "Done — four corners you can fold into legs or petals.", figure: done(SQ) },
    ],
  },
];

// ---------------------------------------------------------------------------
// Characters and objects
// ---------------------------------------------------------------------------

export const MODELS: readonly Foldable[] = [
  {
    id: "cup",
    name: "Cup",
    emoji: "🥤",
    blurb: "Four folds, done before you've finished saying it. The best first fold there is.",
    difficulty: "easy",
    minutes: 2,
    paper: "One square",
    steps: [
      { text: "Fold the paper in half, then in half again, and unfold.", figure: creaseOnly([0, 50], [100, 50]) },
      {
        text: "Fold all four corners into the exact centre.",
        figure: cornerToCentre("left"),
        tip: "Fold one, turn, fold another — keep going round until all four are in.",
      },
      {
        text: "Fold each corner in again, a bit smaller this time.",
        figure: cornerToCentre("right"),
      },
      {
        text: "Fold the bottom point up to the top.", figure: creaseOnly([50, 100], [50, 20], "valley") },
      {
        text: "Fold the bottom point up again to make the cup's rim.",
        figure: creaseOnly([50, 100], [50, 40], "valley"),
      },
      { text: "Open the last flap to make a pocket, and pop the corners apart.", figure: done(SQ), tip: "Hold the bottom corners and push them away from each other." },
    ],
  },
  {
    id: "boat",
    name: "Paper Boat",
    emoji: "⛵",
    blurb: "The hat that turns into a boat. It looks like magic every single time.",
    difficulty: "easy",
    minutes: 5,
    paper: "A rectangle is best — half an A4 sheet",
    steps: [
      {
        text: "Fold the paper in half the long way, then in half again, and unfold.",
        figure: creaseOnly([0, 50], [100, 50]),
        tip: "Start with a rectangle if you have one. A square works too, it just makes a smaller boat.",
      },
      {
        text: "Fold the top corner down to the middle line.",
        figure: cornerToCentre("left"),
      },
      {
        text: "Fold the bottom corner up so the two edges line up — you get a point.",
        figure: { outline: TRI, creases: [{ a: [0, 100], b: [50, 50], kind: "valley" }], flap: { points: [[0, 100], [50, 0], [0, 0]], to: [0, 60] } },
      },
      {
        text: "Fold the other side the same way, then unfold the middle line.",
        figure: { outline: TRI, creases: [{ a: [50, 0], b: [50, 100], kind: "plain" }], flap: { points: [[0, 100], [50, 0], [0, 0]], to: [0, 60] } },
      },
      {
        text: "Pull the sides apart and push the top down to make the hat.",
        figure: { outline: TRI, arrow: { from: [50, 30], to: [50, 90] }, notes: [{ at: [50, 92], text: "open the hat" }] },
        tip: "Hold the point at the bottom, spread the two top corners, and let the middle drop.",
      },
      {
        text: "Fold the bottom point up twice to make a brim, then open it up again.",
        figure: creaseOnly([50, 100], [50, 70], "valley"),
      },
      { text: "Pull the two corners apart and flatten it into a boat.", figure: done(SQ) },
    ],
  },
  {
    id: "heart",
    name: "Heart",
    emoji: "❤️",
    blurb: "A perfect heart from one corner. Best one to give to someone.",
    difficulty: "easy",
    minutes: 3,
    paper: "One square",
    steps: [
      { text: "Fold the paper diagonally into a triangle and unfold.", figure: creaseOnly([0, 0], [100, 100]) },
      {
        text: "Fold the bottom corner up to the top corner.",
        figure: foldSquare([{ a: [0, 100], b: [100, 100], kind: "valley" }], { points: [[0, 100], [100, 100], [50, 50]], to: [50, 5] }),
      },
      {
        text: "Fold the left corner in so its point meets the top point.",
        figure: { outline: TRI, creases: [{ a: [0, 100], b: [50, 0], kind: "valley" }], flap: { points: [[0, 100], [0, 0], [50, 0]], to: [50, 3] } },
      },
      {
        text: "Fold the right corner in the same way.",
        figure: { outline: TRI, creases: [{ a: [100, 100], b: [50, 0], kind: "valley" }], flap: { points: [[100, 100], [0, 0], [50, 0]], to: [50, 3] } },
      },
      {
        text: "Fold the top point down over the bottom edge.",
        figure: creaseOnly([50, 0], [50, 100], "valley"),
      },
      { text: "Turn it over and the heart appears.", figure: flip(TRI), tip: "Hold it from the sides so the points don't splay open." },
    ],
  },
  {
    id: "star",
    name: "Five-Point Star",
    emoji: "⭐",
    blurb: "Just folds and one clever squash. It puffs itself flat at the end.",
    difficulty: "easy",
    minutes: 5,
    paper: "One square",
    steps: [
      { text: "Fold the paper in half, then in half again, and unfold.", figure: creaseOnly([0, 50], [100, 50]) },
      {
        text: "Fold the top corner down to the centre line.",
        figure: cornerToCentre("left"),
      },
      {
        text: "Fold the new top corner down again, so you get a thin strip.",
        figure: { outline: SQ, creases: [{ a: [25, 0], b: [25, 50], kind: "valley" }], flap: { points: [[0, 0], [50, 0], [0, 50]], to: [25, 45] } },
      },
      {
        text: "Fold the strip over and tuck it inside itself.",
        figure: { outline: SQ, arrow: { from: [20, 40], to: [80, 40] }, notes: [{ at: [50, 92], text: "roll it over" }] },
      },
      {
        text: "Keep going until the whole paper is rolled into one long point.",
        figure: { outline: TRI, creases: [{ a: [0, 100], b: [100, 100], kind: "valley" }], flap: { points: [[0, 100], [50, 0], [100, 100]], to: [50, 55] } },
        tip: "Crease every roll tightly, or the star springs open on its own.",
      },
      {
        text: "Pinch the middle together and let go — the star puffs flat.",
        figure: { outline: TRI, arrow: { from: [50, 30], to: [50, 70] }, notes: [{ at: [50, 92], text: "let it puff!" }] },
        tip: "The magic is in letting go, not pushing.",
      },
    ],
  },
  {
    id: "pinwheel",
    name: "Pinwheel",
    emoji: "🎡",
    blurb: "Four corners, one pin, and it spins. The best thing to tape to a stick.",
    difficulty: "easy",
    minutes: 4,
    paper: "One square",
    steps: [
      { text: "Fold the paper in half, then in half again, and unfold.", figure: creaseOnly([0, 50], [100, 50]) },
      {
        text: "Fold one corner in to the centre, then turn it and do the next.",
        figure: cornerToCentre("left"),
      },
      {
        text: "Keep going round so all four corners meet in the middle.",
        figure: cornerToCentre("right"),
        tip: "Finish at the last corner — it sits on top, and that's fine.",
      },
      {
        text: "Fold the folded corners down over the middle to hold them.",
        figure: creaseOnly([50, 50], [50, 100], "valley"),
        tip: "Do them one at a time, left then right.",
      },
      {
        text: "Fold the top point down over them to make a triangle.",
        figure: { outline: TRI, creases: [{ a: [0, 0], b: [100, 0], kind: "valley" }], flap: { points: [[0, 0], [100, 0], [50, 60]], to: [50, 60] } },
      },
      { text: "Push a pin or pencil through the middle — it spins.", figure: done(TRI), tip: "A paperclip on the end of a straw makes a proper pinwheel." },
    ],
  },
  {
    id: "fox",
    name: "Fox Face",
    emoji: "🦊",
    blurb: "Two pointy ears, a white snout. Start here and you'll fold a hundred animals.",
    difficulty: "medium",
    minutes: 12,
    paper: "One square",
    steps: [
      { text: "Make a Preliminary Base first.", figure: square(), ref: "preliminary-base", tip: "It's the base just before the Bird Base." },
      {
        text: "Fold the front layer's bottom point up to the top.",
        figure: { outline: TRI, creases: [{ a: [50, 100], b: [50, 55], kind: "valley" }], flap: { points: [[0, 100], [50, 0], [50, 100]], to: [50, 55] } },
      },
      {
        text: "Fold both of the long bottom flaps up so their points touch the top.",
        figure: { outline: TRI, creases: [{ a: [50, 100], b: [50, 55], kind: "valley" }], flap: { points: [[0, 100], [50, 55], [50, 100]], to: [50, 10] } },
        tip: "One at a time, and line the edges up exactly.",
      },
      {
        text: "Fold the top point down over the face to make the nose.",
        figure: creaseOnly([50, 0], [50, 60], "valley"),
      },
      {
        text: "Pull the two sides in a little for ears, then fold the tips down.",
        figure: { outline: TRI, creases: [{ a: [30, 20], b: [30, 60], kind: "valley" }], flap: { points: [[30, 20], [50, 20], [30, 60]], to: [20, 60] } },
      },
      {
        text: "Pinch the two ears up into points.",
        figure: { outline: TRI, arrow: { from: [50, 45], to: [50, 15] }, notes: [{ at: [50, 92], text: "ears up!" }] },
        tip: "Fold the tips down and back up — that locks the ear in place.",
      },
      { text: "Turn it over, flip the head down, and pull the ears up.", figure: flip(TRI) },
      { text: "Done! Turn it upside down and it's a fox.", figure: done(TRI) },
    ],
  },
  {
    id: "rabbit",
    name: "Rabbit",
    emoji: "🐰",
    blurb: "Two long ears and a round face. Slightly fiddly, very worth it.",
    difficulty: "hard",
    minutes: 15,
    paper: "One square",
    steps: [
      { text: "Make a Preliminary Base first.", figure: square(), ref: "preliminary-base" },
      {
        text: "Fold the front layer's bottom point up to the top and crease well.",
        figure: creaseOnly([50, 100], [50, 55], "valley"),
      },
      {
        text: "Fold the two long flaps up to the top so the points meet.",
        figure: { outline: TRI, creases: [{ a: [50, 100], b: [50, 55], kind: "valley" }], flap: { points: [[0, 100], [50, 55], [50, 100]], to: [50, 10] } },
      },
      {
        text: "Fold the top point down to make the forehead.",
        figure: creaseOnly([50, 0], [50, 60], "valley"),
      },
      {
        text: "Fold both ears up with an inside-reverse fold, so they lean out slightly.",
        figure: { outline: TRI, arrow: { from: [40, 50], to: [30, 15] }, notes: [{ at: [50, 92], text: "ears up" }] },
        tip: "Inside-reverse fold means: push the point in with your finger, let it pop up the other way, then crease it.",
      },
      {
        text: "Pull the ears apart a little so they don't overlap.",
        figure: { outline: TRI, arrow: { from: [50, 30], to: [50, 30] }, notes: [{ at: [50, 92], text: "spread the ears" }] },
      },
      { text: "Fold the nose down, flip over, and pull the ears up.", figure: flip(TRI) },
      { text: "Done — tip the head back to make it look at you.", figure: done(TRI) },
    ],
  },
  {
    id: "duck",
    name: "Duck",
    emoji: "🦆",
    blurb: "A quick one that floats, which is the best possible ending.",
    difficulty: "easy",
    minutes: 6,
    paper: "One square",
    steps: [
      {
        text: "Fold the bottom corner up to the top corner, then unfold.",
        figure: creaseOnly([0, 100], [100, 100], "plain"),
      },
      {
        text: "Fold the left corner in to the centre crease, and the right corner too.",
        figure: cornerToCentre("left"),
      },
      {
        text: "Fold the top triangle down over them.",
        figure: { outline: TRI, creases: [{ a: [0, 0], b: [100, 0], kind: "valley" }], flap: { points: [[0, 0], [100, 0], [50, 70]], to: [50, 70] } },
      },
      {
        text: "Fold the bottom point up to make the body.",
        figure: creaseOnly([50, 100], [50, 55], "valley"),
      },
      {
        text: "Pull the two sides apart and squash them flat.",
        figure: squash(),
      },
      {
        text: "Fold the tip down for a beak, then open it up.",
        figure: { outline: TRI, arrow: { from: [70, 20], to: [45, 20] }, notes: [{ at: [50, 92], text: "open it up" }] },
      },
      { text: "Done. Put it in the bath.", figure: done(TRI), tip: "It really does float." },
    ],
  },
  {
    id: "crane",
    name: "Paper Crane",
    emoji: "🕊️",
    blurb: "The famous one. Hard, a bit humbling, and worth every crease.",
    difficulty: "hard",
    minutes: 20,
    paper: "One square, or a bird-base printout",
    steps: [
      { text: "Make a Bird Base first.", figure: square(), ref: "bird-base", tip: "The Bird Base is three steps before this one." },
      {
        text: "Fold the thin points up, then fold them back down along the creases you just made.",
        figure: { outline: TRI, creases: [{ a: [30, 60], b: [50, 30], kind: "valley" }, { a: [70, 60], b: [50, 30], kind: "valley" }], flap: { points: [[0, 100], [50, 30], [100, 100]], to: [50, 45] } },
        tip: "The 'fold and unfold' is not a mistake — it's how you mark where to go.",
      },
      {
        text: "Fold the two points up with inside-reverse folds to make the neck and tail.",
        figure: { outline: TRI, arrow: { from: [35, 70], to: [20, 25] }, notes: [{ at: [50, 92], text: "neck + tail" }] },
      },
      {
        text: "Fold the head down with an inside-reverse fold, aiming the beak slightly back.",
        figure: { outline: TRI, arrow: { from: [22, 28], to: [40, 40] }, notes: [{ at: [50, 92], text: "fold the head" }] },
        tip: "Aim the beak just a bit behind straight — a straight beak looks stiff.",
      },
      {
        text: "Fold both wings down as far as they'll go.",
        figure: { outline: TRI, creases: [{ a: [50, 50], b: [10, 75], kind: "valley" }, { a: [50, 50], b: [90, 75], kind: "valley" }], flap: { points: [[20, 55], [50, 45], [80, 55]], to: [50, 80] } },
      },
      {
        text: "Pull the wings apart and blow gently into the hole underneath.",
        figure: { outline: TRI, arrow: { from: [50, 80], to: [50, 55] }, notes: [{ at: [50, 92], text: "blow here" }] },
        tip: "If it doesn't puff, the creases weren't sharp enough. Unfold and redo.",
      },
      { text: "Done — wings out, and it flutters if you let it fall.", figure: done(TRI) },
    ],
  },
  {
    id: "flower",
    name: "Blossom",
    emoji: "🌸",
    blurb: "Four petals and a stem, from a Frog Base. Good for a grown-up's lap.",
    difficulty: "medium",
    minutes: 12,
    paper: "One square",
    steps: [
      { text: "Make a Frog Base first.", figure: square(), ref: "frog-base", tip: "Wide base, four corners." },
      {
        text: "Fold the left and right corners in to the middle.",
        figure: { outline: SQ, creases: [{ a: [25, 50], b: [25, 100], kind: "valley" }], flap: { points: [[0, 50], [0, 100], [25, 100]], to: [25, 75] } },
      },
      {
        text: "Petal-fold both of those corners up so the points meet the top.",
        figure: { outline: SQ, creases: [{ a: [25, 50], b: [50, 20], kind: "valley" }], flap: { points: [[0, 50], [25, 50], [25, 100]], to: [35, 30] } },
      },
      { text: "Turn it over and do the same on the back.", figure: flip(SQ) },
      {
        text: "Turn it over, fold the stem down, and bend it a little.",
        figure: creaseOnly([50, 100], [50, 60], "valley"),
        tip: "Bend the stem by pulling it over your fingernail.",
      },
      {
        text: "Open each petal gently — push the point up with a pencil.",
        figure: { outline: SQ, arrow: { from: [35, 55], to: [45, 35] }, notes: [{ at: [50, 92], text: "curl the petals" }] },
      },
      { text: "Done — put it in a jam jar.", figure: done(SQ) },
    ],
  },
];

// ---------------------------------------------------------------------------
// Hacks — the tricks that make everything else easier
// ---------------------------------------------------------------------------

export const HACKS: readonly Hack[] = [
  {
    id: "square-no-ruler",
    title: "Make a perfect square without a ruler",
    emoji: "📐",
    body: "Fold one corner of the paper over to the opposite edge so the corner just touches it. The crease is a perfect diagonal — cut along it and you have a square. No measuring, no ruler, no guessing.",
    why: "Almost every origami model starts from a square, and a wonky one makes every later fold fight back.",
  },
  {
    id: "crease-sharp",
    title: "Crease sharply, then unfold",
    emoji: "💪",
    body: "Press hard with your thumbnail along the fold, then run it again the other way. Unfold it fully so the line stays. A fold you can't see yet still needs making — fold, crease, unfold, every single time.",
    why: "Soft creases are the number one reason a model refuses to fold. Sharp lines make the paper do what you ask.",
  },
  {
    id: "mountain-valley",
    title: "Know which way the fold goes",
    emoji: "⛰️",
    body: "A valley fold is a dent — the paper folds toward you and the crease sinks in. A mountain fold is a ridge — the paper folds away from you and the crease bumps up. Squash the whole model first: a mountain fold on the left is a valley fold when you turn the model over.",
    why: "Getting this backwards is why a crane ends up inside out and impossible to fix.",
  },
  {
    id: "squash-fold",
    title: "The squash fold",
    emoji: "🫳",
    body: "Crease the shape flat, unfold it, then open the flap like a book and push the sides together so it flattens into a new shape. Push the sides in at the same time as you lift.",
    why: "This one move creates the square base, the preliminary base and the frog base. Learn it and half of origami opens up.",
  },
  {
    id: "reverse-fold",
    title: "The inside-reverse fold",
    emoji: "🔄",
    body: "Open up the point you want to move. Push the tip inward with your finger so the paper flips and points back out the other way, then press the new crease flat. It looks impossible right up until it works.",
    why: "This is how you make a crane's neck, a rabbit's ears and a duck's beak — every animal gets its personality from it.",
  },
  {
    id: "paper-choice",
    title: "Use the right paper",
    emoji: "📄",
    body: "Printer paper is fine. Even better is anything thin and crisp — the back of a notepad, a shopping bag, thin wrapping paper. Avoid thick card, tissue paper and anything already crumpled: they tear or refuse to crease.",
    why: "Paper that's too thick fights every fold and cracks at the point instead of bending.",
  },
  {
    id: "start-flat",
    title: "Start from a base, not a square",
    emoji: "🔻",
    body: "Once you know the square base and the preliminary base, most models stop being thirty steps and start being five. Spend a week making bases and you'll fold twice as fast for the rest of your life.",
    why: "Bases do the boring folds once, so you never have to repeat them.",
  },
  {
    id: "count-layers",
    title: "Count the layers before you fold",
    emoji: "🔢",
    body: "When a model says 'the front layer', it usually means just the top one — not all of them. Before you fold, count how many sheets of paper you can see on the edge. Two layers means fold one, not both.",
    why: "Folding every layer when the instructions wanted one is the most common way to get stuck.",
  },
  {
    id: "open-sink",
    title: "Open the sink to start over",
    emoji: "🕳️",
    body: "Stuck? Push gently into the pocket at the bottom of the model and slowly open it out along the creases you've already made. Unfolding never ruins paper, it just takes time — pushing harder does.",
    why: "Half the models are a few steps from a base, and the creases you need are already in the paper.",
  },
  {
    id: "bone-folder",
    title: "Your fingernail is a bone folder",
    emoji: "💅",
    body: "A real bone folder is a flat plastic tool, but a thumbnail does the same job. Hold the paper on a hard surface and press along the crease with your nail rather than your finger.",
    why: "A sharp crease is the single biggest difference between a model that looks folded and one that looks made.",
  },
];

// ---------------------------------------------------------------------------
// Lookups — kept pure so the UI never indexes into an array blindly.
// ---------------------------------------------------------------------------

export const DIFFICULTY_ORDER: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

/** Every model and base in one list, bases first. */
export function allFoldables(): Foldable[] {
  return [...BASES, ...MODELS];
}

export function findFoldable(id: string): Foldable | undefined {
  return allFoldables().find((f) => f.id === id);
}

export function findHack(id: string): Hack | undefined {
  return HACKS.find((h) => h.id === id);
}

/** The order the picker shows things in: easiest first, then by name. */
export function byDifficulty<T extends { difficulty: Difficulty; name: string }>(list: readonly T[]): T[] {
  return [...list].sort(
    (a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] || a.name.localeCompare(b.name),
  );
}

/** How many folds are in the whole library — shown as a little flourish. */
export function totalSteps(): number {
  return allFoldables().reduce((n, f) => n + f.steps.length, 0);
}