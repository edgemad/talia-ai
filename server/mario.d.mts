// Typings for the Super Hop engine — server/mario.mjs.

import type { MarioState } from "../shared/marioCore.mjs";

export interface MarioOpts {
  /** Attach a one-line `note` for the canvas toast instead of a text frame. */
  quiet?: boolean;
}

export interface MarioStep {
  state: MarioState;
  reply?: string;
  needsLlm?: boolean;
  note?: string;
}

export interface MarioEngine {
  id: string;
  seed: (opts?: Record<string, unknown>) => MarioState;
  step: (state: MarioState, text: string, opts?: MarioOpts) => MarioStep;
  intro: (state?: MarioState) => string;
  systemPrompt: (state?: MarioState) => string;
  fallback: (state: MarioState) => string;
  parseLlmReply: (state: MarioState, reply: string) => null;
  helpers: {
    inputFor: (text: string) => string;
    statusLine: (s: MarioState) => string;
    frame: (s: MarioState) => string;
    MAX_TICKS: number;
    progress: (s: MarioState) => number;
  };
}

/** Longest run of simulation one call may advance. */
export declare const MAX_TICKS: number;

/** Turn a line of chat text (or `go <chars>`) into a run of input. */
export declare function inputFor(text: string): string;

export declare const mario: MarioEngine;
