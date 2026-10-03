// Typings for the Blockcraft (voxel builder) engine — server/blockcraft.mjs.

export declare const WORLD_W: number;
export declare const WORLD_H: number;
export declare const REACH: number;
export declare const BLOCKS: Record<string, string>;
export declare const PLACEABLE: string[];

export interface BlockcraftOpts {
  /** Also return `note`: the one-line human message without the ASCII frame. */
  quiet?: boolean;
  /** Never end the round — hitting the goal celebrates and keeps the world open. */
  creative?: boolean;
  /** Max cell distance from the player for mine/place (0/undefined = unlimited). */
  reach?: number;
}

export interface BlockcraftStep {
  state: BlockcraftState;
  reply?: string;
  needsLlm?: boolean;
  prompt?: string;
  wrap?: boolean;
  note?: string;
}

export interface BlockcraftBlueprint {
  w: number;
  h: number;
  mat: string;
  x0: number;
  y0: number;
  cells: [number, number][];
  filled: boolean[];
}

export interface BlockcraftState {
  rows: string[][];
  px: number;
  py: number;
  facing: number;
  inv: Record<string, number>;
  /** Hotbar selection: the block a bare `place` will use. */
  sel?: string;
  /** Arm's reach in cells, published so the canvas can shade what it can touch. */
  reach?: number;
  turn: number;
  mined: number;
  placed: number;
  goal: number;
  want?: string;
  blueprint: BlockcraftBlueprint | null;
  status: "playing" | "won" | "lost";
  score?: number;
  /** Creative mode already celebrated the goal — don't announce it twice. */
  celebrated?: boolean;
}

export interface BlockcraftEngine {
  id: string;
  seed: (opts?: Record<string, unknown>) => BlockcraftState;
  step: (state: BlockcraftState, input: string, opts?: BlockcraftOpts) => BlockcraftStep;
  intro: (state: BlockcraftState) => string;
  systemPrompt: (state: BlockcraftState) => string;
  fallback: (state: BlockcraftState) => string;
  parseLlmReply: (state: BlockcraftState, reply: string) => BlockcraftState | null;
  target: (state: BlockcraftState, words: string[]) => [number, number];
  put: (state: BlockcraftState, code: string, cells: [number, number][]) => BlockcraftState | null;
  fill: (state: BlockcraftState, wantCode?: string | null) => BlockcraftState | null;
  afterPlace: (state: BlockcraftState, note: string) => BlockcraftStep;
}

export declare function codeFromName(word: string): string | null;
export declare function outlineCells(x0: number, y0: number, w: number, h: number): [number, number][];
export declare function renderWorld(state: BlockcraftState): string;
export declare function extractNote(reply: string): string;
export declare const blockcraft: BlockcraftEngine;
