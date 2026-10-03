// Typings for the shared Super Hop physics — shared/marioCore.mjs.

export declare const TICK_HZ: number;
export declare const TILE: number;
export declare const VIEW_W: number;
export declare const VIEW_H: number;
export declare const LEVEL_W: number;
export declare const LEVEL_H: number;
export declare const GOAL_X: number;
export declare const PLAYER_W: number;
export declare const PLAYER_H: number;
export declare const ENEMY_W: number;
export declare const ENEMY_H: number;
export declare const INVULN_TICKS: number;

export declare const PHYS: {
  gravity: number;
  accel: number;
  maxRun: number;
  friction: number;
  jump: number;
  jumpCut: number;
  coyoteTicks: number;
  bufferTicks: number;
  rearmTicks: number;
  stompBounce: number;
  maxFall: number;
  enemySpeed: number;
};

export interface HeldControls {
  left?: boolean;
  right?: boolean;
  jump?: boolean;
}

export interface MarioCoin {
  x: number;
  y: number;
  got: boolean;
}

export interface MarioEnemy {
  x: number;
  y: number;
  vx: number;
  alive: boolean;
}

export type MarioEvent = "jump" | "coin" | "stomp" | "hurt" | "pit" | "respawn" | "win";

export interface MarioState {
  /** Index into {@link LEVELS}, 0-based. Set by `makeState`; never changes. */
  level: number;
  /** e.g. "2-1" */
  levelId: string;
  /** e.g. "High Rise" */
  levelName: string;
  /** How many levels the level select offers. */
  levelCount: number;
  /** Top-left of the player's hitbox, in pixels. */
  px: number;
  py: number;
  vx: number;
  vy: number;
  /** 1 = facing right, -1 = facing left. */
  face: number;
  onGround: boolean;
  jPrev: boolean;
  /** Ticks spent standing on something — lets a held jump re-arm on landing. */
  onGroundFor: number;
  /** Ticks of coyote time left. */
  coyote: number;
  /** Ticks a queued jump press is still remembered. */
  buffer: number;
  /** Ticks of blinking invulnerability left. */
  invuln: number;
  coins: MarioCoin[];
  enemies: MarioEnemy[];
  coinsGot: number;
  score: number;
  lives: number;
  tick: number;
  furthest: number;
  status: "playing" | "won" | "lost";
  /** What happened this tick; the client turns these into particles and toasts. */
  events: MarioEvent[];
  /** Published by the engine's `seed` so the client knows the level size. */
  levelW?: number;
  viewW?: number;
  viewH?: number;
  coinsTotal?: number;
}

/** One entry in the level select, as authored and then made playable. */
export interface LevelSpec {
  id: string;
  name: string;
  blurb: string;
  lives: number;
}

export declare const LEVEL_SPECS: LevelSpec[];
export declare const LEVELS: string[][];
export declare const LEVEL: string[];
export declare const INPUT_CHARS: string;
export declare const IDLE_INPUT: string;

export declare function encodeInput(c: HeldControls): string;
export declare function decodeInput(input: string): string[];
export declare function isSolidTile(ch: string): boolean;
export declare function levelTiles(level?: number): string[];
/** Is there something solid at this tile? Outside the sides is a wall, below is the void. */
export declare function solidAt(px: number, py: number, level?: number): boolean;
/** Advance one tick. Never mutates `prev`. */
export declare function tick(prev: MarioState, ch: string): MarioState;
/** Advance many ticks at once, gathering the events from all of them. */
export declare function advance(state: MarioState, input: string): MarioState;
/** Let the world run on its own for `seconds` (used when a client stalls). */
export declare function idle(state: MarioState, seconds: number): MarioState;
export declare function makeState(opts?: { level?: number }): MarioState;
export declare function cameraX(state: MarioState): number;
export declare function coinsTotal(state: MarioState): number;
/** 0..1 along the level. */
export declare function progress(state: MarioState): number;
export declare function renderWorld(state: MarioState, cols?: number, rows?: number): string;
/** Collapse a batch of events into one short line for the toast. */
export declare function summarize(events: MarioEvent[]): string;
